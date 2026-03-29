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
    if (err.message?.includes('usage limits')) {
      console.log('[worker] Anthropic limit reached, stopping queue')
      await supabase.from('analysis_queue')
        .update({ status: 'pending' })
        .eq('id', job.id)
      return 'limit_reached'
    }

    console.error(`[worker] Job ${job.id} failed:`, err.message)
    await supabase.from('analysis_queue')
      .update({ status: 'error', error: err.message })
      .eq('id', job.id)
  }
}

