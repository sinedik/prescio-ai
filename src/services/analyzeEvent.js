import { supabase } from '../lib/supabase.js'
import { callSonnet, parseJSON } from '../lib/claude.js'
import { ANALYZE_EVENT_SYSTEM, buildAnalyzeEventPrompt } from '../prompts/analyzeEvent.js'

export async function analyzeEvent(eventId, triggeredBy = 'user_request') {
  console.log(`[analyzeEvent] Starting: ${eventId}`)

  const { data: event, error } = await supabase
    .from('events')
    .select('*, markets(*)')
    .eq('id', eventId)
    .single()

  if (error || !event) throw new Error(`Event ${eventId} not found`)

  const markets = event.markets || []
  console.log(`[analyzeEvent] Event: "${event.title}" with ${markets.length} markets`)

  const prompt = buildAnalyzeEventPrompt(event, markets)
  const text = await callSonnet(ANALYZE_EVENT_SYSTEM, prompt, true)
  const analysis = parseJSON(text)

  if (!analysis) throw new Error('Failed to parse event analysis')

  const { error: upsertError } = await supabase
    .from('event_analyses')
    .upsert({
      event_id: eventId,
      situation_summary: analysis.situation_summary,
      key_factors: analysis.key_factors || [],
      primary_sources: analysis.primary_sources || [],
      overall_sentiment: analysis.overall_sentiment,
      uncertainty_level: analysis.uncertainty_level,
      triggered_by: triggeredBy,
      model: 'claude-sonnet-4-6',
      analyzed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'event_id' })

  if (upsertError) throw new Error(`Save error: ${upsertError.message}`)

  console.log(`[analyzeEvent] Saved. Sentiment: ${analysis.overall_sentiment}`)

  if (markets.length > 0) {
    await supabase.from('analysis_queue').upsert(
      markets.map(m => ({
        market_id: m.id,
        event_id: eventId,
        triggered_by: 'after_event_analysis',
        priority: 3,
        status: 'pending'
      })),
      { onConflict: 'market_id', ignoreDuplicates: true }
    )
    console.log(`[analyzeEvent] Queued ${markets.length} markets`)
  }

  return analysis
}
