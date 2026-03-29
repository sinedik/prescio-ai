import { supabase } from '../lib/supabase.js'
import { callHaiku, parseJSON } from '../lib/claude.js'
import { CHECK_NEWS_SYSTEM, buildCheckNewsPrompt } from '../prompts/checkNews.js'

export async function checkNews(eventId) {
  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).single()

  if (!event) throw new Error(`Event ${eventId} not found`)

  const text = await callHaiku(CHECK_NEWS_SYSTEM, buildCheckNewsPrompt(event), true)
  const result = parseJSON(text)

  await supabase.from('events')
    .update({ last_news_check_at: new Date().toISOString() })
    .eq('id', eventId)

  if (result?.has_news && result.significance !== 'low') {
    await supabase.from('analysis_queue').insert({
      event_id: eventId,
      triggered_by: 'news_detected',
      priority: 2,
      status: 'pending'
    })
    console.log(`[checkNews] News: ${result.headline}`)
  }

  return result
}
