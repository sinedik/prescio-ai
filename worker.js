import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { withRetry } from './utils/retry.js'

import { analyzeEvent } from './services/analyzeEvent.js'
import { analyzeMarket } from './services/analyzeMarket.js'
import { analyzeSportOdds } from './services/analyzeSportOdds.js'
import { analyzeSportEvent } from './services/analyzeSportEvent.js'
import { matchCrossSources } from './services/matchCrossSources.js'
import { checkNews } from './services/checkNews.js'
import { groupMarkets } from './services/groupMarkets.js'
import { analyzeSearchEvent } from './services/analyzeSearchEvent.js'

const db = createClient(config.supabase.url, config.supabase.serviceKey)

const HANDLERS = {
  analyze_event:       analyzeEvent,
  analyze_market:      analyzeMarket,
  analyze_sport_odds:  analyzeSportOdds,
  analyze_sport_event: analyzeSportEvent,
  match_cross_sources: matchCrossSources,
  check_news:          checkNews,
  group_markets:       groupMarkets,
  ai_search:           analyzeSearchEvent,
}

async function processJob(job) {
  const { id, triggered_by } = job
  const handler = HANDLERS[triggered_by]

  if (!handler) {
    logger.warn('Unknown triggered_by', { jobId: id, triggered_by })
    await markFailed(id, `Unknown handler: ${triggered_by}`)
    return
  }

  logger.info('Processing job', { jobId: id, triggered_by })

  await db.from('analysis_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id)

  try {
    await withRetry(() => handler(job, db), {
      maxRetries: config.worker.maxRetries,
      delayMs:    config.worker.retryDelayMs,
      label:      `${triggered_by}:${id}`,
    })

    await db.from('analysis_queue')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id)

    logger.info('Job completed', { jobId: id, triggered_by })
  } catch (err) {
    logger.error('Job failed after retries', { jobId: id, triggered_by, error: err.message })
    await markFailed(id, err.message)

    await db.from('analysis_queue')
      .update({
        attempts:   (job.attempts || 0) + 1,
        last_error: err.message,
      })
      .eq('id', id)
  }
}

async function markFailed(jobId, reason) {
  await db.from('analysis_queue')
    .update({
      status:     'failed',
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

// Защита от параллельной обработки одного job-а
const processing = new Set()

export function startWorker() {
  logger.info('Starting prescio-ai worker')

  const channel = db
    .channel('analysis_queue_inserts')
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'analysis_queue',
        filter: 'status=eq.pending',
      },
      async (payload) => {
        const job = payload.new
        if (processing.has(job.id)) return
        processing.add(job.id)
        try {
          await processJob(job)
        } finally {
          processing.delete(job.id)
        }
      }
    )
    .subscribe((status) => {
      logger.info('Realtime subscription status', { status })
    })

  // Polling fallback — подбирает pending jobs которые могли пропустить
  setInterval(async () => {
    const { data: pendingJobs } = await db
      .from('analysis_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', config.worker.maxRetries)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10)

    for (const job of pendingJobs || []) {
      if (!processing.has(job.id)) {
        processing.add(job.id)
        processJob(job).finally(() => processing.delete(job.id))
      }
    }
  }, 30_000)

  return channel
}
