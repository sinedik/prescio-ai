import { supabase } from './lib/supabase.js'
import { config } from './config.js'
import { analyzeEvent } from './services/analyzeEvent.js'
import { analyzeMarket } from './services/analyzeMarket.js'
import { checkNews } from './services/checkNews.js'
import { groupMarkets } from './services/groupMarkets.js'

const SONNET_TRIGGERS = new Set(['analyze_event', 'analyze_market', 'ai_search'])

let activeJobs   = 0
let activeSonnet = 0

const processing = new Set()

const HANDLERS = {
  analyze_event:   (job) => analyzeEvent(job.event_id, job.triggered_by),
  analyze_market:  (job) => analyzeMarket(job.market_id, job.event_id, job.triggered_by),
  check_news:      (job) => checkNews(job.event_id),
  group_markets:   (job) => groupMarkets(job.metadata?.market_ids || []),
  // sport handlers (processed by prescio-ai as stubs if not implemented yet)
  analyze_sport_odds:   (job) => Promise.resolve(),
  match_cross_sources:  (job) => Promise.resolve(),
}

async function withRetry(fn, { maxRetries, delayMs, label }) {
  let lastErr
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      console.error(`[withRetry] ${label} attempt ${attempt + 1} failed:`, err.message)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

async function markFailed(id, message) {
  await supabase.from('analysis_queue')
    .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function processJob(job) {
  const { id, triggered_by } = job
  const isSonnet = SONNET_TRIGGERS.has(triggered_by)

  const maxJobs   = config.seed.enabled ? 1 : config.worker.maxConcurrentJobs
  const maxSonnet = config.seed.enabled ? 1 : config.worker.maxConcurrentSonnet

  if (activeJobs >= maxJobs) {
    console.log(`[worker] Concurrency limit reached, polling will retry — jobId: ${id}, activeJobs: ${activeJobs}`)
    return
  }
  if (isSonnet && activeSonnet >= maxSonnet) {
    console.log(`[worker] Sonnet concurrency limit reached — jobId: ${id}, activeSonnet: ${activeSonnet}`)
    return
  }

  activeJobs++
  if (isSonnet) activeSonnet++

  await supabase.from('analysis_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id)

  try {
    const handler = HANDLERS[triggered_by]
    if (!handler) {
      await markFailed(id, `Unknown handler: ${triggered_by}`)
      return
    }

    await withRetry(() => handler(job), {
      maxRetries: config.worker.maxRetries,
      delayMs:    config.worker.retryDelayMs,
      label:      `${triggered_by}:${id}`,
    })

    await supabase.from('analysis_queue')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id)

    console.log(`[worker] Job completed — jobId: ${id}, type: ${triggered_by}, activeJobs: ${activeJobs - 1}`)
  } catch (err) {
    // Handle Anthropic usage limit gracefully
    if (err.message?.includes('usage limits')) {
      console.log('[worker] Anthropic limit reached, reverting to pending')
      await supabase.from('analysis_queue')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id)
      return
    }

    console.error(`[worker] Job failed — jobId: ${id}, type: ${triggered_by}:`, err.message)
    await markFailed(id, err.message)
    await supabase.from('analysis_queue')
      .update({ attempts: (job.attempts || 0) + 1, last_error: err.message })
      .eq('id', id)
  } finally {
    activeJobs--
    if (isSonnet) activeSonnet--
  }
}

export function startPolling() {
  setInterval(async () => {
    const availableSlots = (config.seed.enabled ? 1 : config.worker.maxConcurrentJobs) - activeJobs
    if (availableSlots <= 0) return

    const { data: pendingJobs } = await supabase
      .from('analysis_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', config.worker.maxRetries)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(availableSlots)

    for (const job of pendingJobs || []) {
      if (!processing.has(job.id)) {
        processing.add(job.id)
        processJob(job).finally(() => processing.delete(job.id))
      }
    }
  }, 30_000)

  console.log('[worker] Polling started (30s interval)')
}
