import { supabase } from '../lib/supabase.js'
import { callSonnet, parseJSON } from '../lib/claude.js'
import { ANALYZE_MARKET_SYSTEM, buildAnalyzeMarketPrompt } from '../prompts/analyzeMarket.js'

const VALID_TRIGGERED_BY = new Set(['user_request', 'scheduled', 'news_detected'])

export async function analyzeMarket(marketId, eventId, triggeredBy = 'user_request') {
  const normalizedTrigger = VALID_TRIGGERED_BY.has(triggeredBy) ? triggeredBy : 'scheduled'
  console.log(`[analyzeMarket] Starting: ${marketId}`)

  const { data: market } = await supabase
    .from('markets')
    .select('*')
    .eq('id', marketId)
    .single()

  if (!market) throw new Error(`Market ${marketId} not found`)

  const eid = eventId || market.event_id
  let eventAnalysis = null
  if (eid) {
    const { data } = await supabase
      .from('event_analyses')
      .select('*')
      .eq('event_id', eid)
      .single()
    eventAnalysis = data
  }

  console.log(`[analyzeMarket] "${market.question}" at ${market.yes_price}%`)
  console.log(`[analyzeMarket] Event context: ${eventAnalysis ? 'found' : 'none'}`)

  const prompt = buildAnalyzeMarketPrompt(market, eventAnalysis)
  const text = await callSonnet(ANALYZE_MARKET_SYSTEM, prompt, false)
  const analysis = parseJSON(text)

  if (!analysis) throw new Error('Failed to parse market analysis')

  const { data: ea } = eventAnalysis ? { data: eventAnalysis } :
    await supabase.from('event_analyses').select('id').eq('event_id', eid).single()

  const { error } = await supabase
    .from('market_analyses')
    .upsert({
      market_id: marketId,
      event_analysis_id: ea?.id || null,
      fair_prob: analysis.fair_prob,
      market_prob: market.yes_price,
      edge_score: analysis.edge_score,
      confidence_score: analysis.confidence_score,
      kelly_fraction: analysis.kelly_fraction,
      recommendation: analysis.recommendation,
      thesis: analysis.thesis,
      crowd_bias: analysis.crowd_bias,
      resolution_note: analysis.resolution_note,
      risk_factors: analysis.risk_factors,
      relevant_news: [],
      triggered_by: normalizedTrigger,
      model: 'claude-sonnet-4-6',
      analyzed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'market_id' })

  if (error) throw new Error(`Save error: ${error.message}`)

  console.log(`[analyzeMarket] Saved. Edge: ${analysis.edge_score}pp Rec: ${analysis.recommendation}`)
  return analysis
}
