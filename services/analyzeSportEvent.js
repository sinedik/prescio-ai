import { callWithTools } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { config } from '../config.js'
import { buildSportEventPrompt } from '../prompts/sportEvent.js'

export async function analyzeSportEvent(job, db) {
  const { sport_event_id } = job

  const { data: sportEvent, error } = await db
    .from('sport_events')
    .select('*, sport_odds(*)')
    .eq('id', sport_event_id)
    .single()

  if (error || !sportEvent) throw new Error(`SportEvent not found: ${sport_event_id}`)

  let prediction = null
  if (sportEvent.subcategory === 'football' && sportEvent.raw_data?.fixture_id) {
    const { data } = await db
      .from('sport_predictions')
      .select('winner_name, winner_comment, advice, home_pct, draw_pct, away_pct, comparison')
      .eq('fixture_id', sportEvent.raw_data.fixture_id)
      .maybeSingle()
    prediction = data ?? null
  }

  const oddsSummary = (sportEvent.sport_odds || []).map(o => ({
    bookmaker:   o.bookmaker,
    market_type: o.market_type,
    outcomes:    o.outcomes,
  }))

  const contextParts = [
    `Match: ${sportEvent.home_team} vs ${sportEvent.away_team}`,
    `League: ${sportEvent.league}`,
    `Starts: ${sportEvent.starts_at}`,
    `Status: ${sportEvent.status}`,
  ]
  if (sportEvent.raw_data?.home_form) contextParts.push(`Home form: ${JSON.stringify(sportEvent.raw_data.home_form)}`)
  if (sportEvent.raw_data?.away_form) contextParts.push(`Away form: ${JSON.stringify(sportEvent.raw_data.away_form)}`)
  if (oddsSummary.length)              contextParts.push(`Bookmaker odds: ${JSON.stringify(oddsSummary)}`)
  if (prediction)                      contextParts.push(`API-Sports prediction: ${JSON.stringify(prediction)}`)

  logger.info('Analyzing sport event', {
    sportEventId: sport_event_id,
    match: `${sportEvent.home_team} vs ${sportEvent.away_team}`,
    subcategory: sportEvent.subcategory,
    oddsCount: oddsSummary.length,
    hasPrediction: Boolean(prediction),
  })

  const { textBlocks, depth } = await callWithTools({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: buildSportEventPrompt(sportEvent),
    messages: [{
      role: 'user',
      content: `Analyze this ${sportEvent.subcategory} match and return JSON only.

${contextParts.join('\n')}`,
    }],
  })

  logger.info('Sport event analysis tool loop', { sportEventId: sport_event_id, depth })

  const text = textBlocks.map(b => b.text).join('')
  const parsed = parseJsonSafe(text)

  if (!parsed) throw new Error(`Failed to parse sport event analysis for ${sport_event_id}`)

  const expiresAt = new Date(Date.now() + config.worker.analysisExpiresHours * 3600_000)

  const { error: upsertError } = await db
    .from('event_analyses')
    .upsert({
      sport_event_id,
      summary:         parsed.summary,
      key_factors:     parsed.key_factors,
      probability:     parsed.probability,
      edge_score:      parsed.edge_score,
      kelly_fraction:  parsed.kelly_fraction,
      scenarios:       parsed.scenarios,
      news_context:    parsed.news_context,
      overall_sentiment: parsed.overall_sentiment,
      uncertainty_level: parsed.uncertainty_level,
      model_used:      'claude-sonnet-4-6',
      web_search_used: true,
      expires_at:      expiresAt.toISOString(),
    }, { onConflict: 'sport_event_id' })

  if (upsertError) throw upsertError

  // Update ai_score in unified_events if present
  await db
    .from('unified_events')
    .update({ ai_score: parsed.edge_score, enriched_at: new Date().toISOString() })
    .eq('source_id', sport_event_id)
    .eq('source_type', 'sport')

  logger.info('Sport event analysis saved', { sportEventId: sport_event_id })
}
