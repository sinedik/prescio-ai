import { supabase } from './lib/supabase.js'
import { analyzeEvent } from './services/analyzeEvent.js'
import { analyzeMarket } from './services/analyzeMarket.js'
import { checkNews } from './services/checkNews.js'
import { groupMarkets } from './services/groupMarkets.js'

export async function processJob(job) {
  console.log(`[worker] Job ${job.id} | type: ${job.triggered_by}`)

  await supabase.from('analysis_queue')
    .update({ status: 'in_progress' })
    .eq('id', job.id)

  try {
    if (job.triggered_by === 'group_markets') {
      await groupMarkets(job.metadata?.market_ids || [])
    } else if (job.triggered_by === 'check_news') {
      await checkNews(job.event_id)
    } else if (job.event_id && !job.market_id) {
      await analyzeEvent(job.event_id, job.triggered_by)
    } else if (job.market_id) {
      await analyzeMarket(job.market_id, job.event_id, job.triggered_by)
    }

    await supabase.from('analysis_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', job.id)

    console.log(`[worker] Job ${job.id} done`)

  } catch (err) {
    console.error(`[worker] Job ${job.id} failed:`, err.message)
    await supabase.from('analysis_queue')
      .update({ status: 'error', error: err.message })
      .eq('id', job.id)
  }
}

export async function processPendingJobs(limit = 3) {
  const { data: jobs } = await supabase
    .from('analysis_queue')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!jobs?.length) return

  console.log(`[worker] ${jobs.length} pending jobs`)

  for (const job of jobs) {
    await processJob(job)
    await new Promise(r => setTimeout(r, 2000))
  }
}
