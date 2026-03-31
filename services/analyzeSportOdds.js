import { callWithTimeout } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { buildSportOddsPrompt } from '../prompts/sportOdds.js'

export async function analyzeSportOdds(job, db) {
  const { sport_event_id } = job

  const { data: sportEvent } = await db
    .from('sport_events')
    .select('*, sport_odds(*)')
    .eq('id', sport_event_id)
    .single()

  if (!sportEvent) throw new Error(`SportEvent not found: ${sport_event_id}`)

  if (!sportEvent.sport_odds?.length) {
    logger.warn('No odds found for sport event', { sportEventId: sport_event_id })
    return
  }

  logger.info('Analyzing sport odds', {
    sportEventId: sport_event_id,
    match: `${sportEvent.home_team} vs ${sportEvent.away_team}`,
    oddsCount: sportEvent.sport_odds.length,
  })

  const response = await callWithTimeout({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSportOddsPrompt(),
    messages: [{
      role: 'user',
      content: `Analyze odds for: ${sportEvent.home_team} vs ${sportEvent.away_team}
League: ${sportEvent.league}
Starts: ${sportEvent.starts_at}

Odds from bookmakers:
${JSON.stringify(sportEvent.sport_odds, null, 2)}

Return JSON only with value analysis per bookmaker per market.`,
    }],
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  const parsed = parseJsonSafe(text)

  if (!parsed?.analyses) throw new Error(`Failed to parse sport odds analysis for ${sport_event_id}`)

  // Обновляем ai_value в каждой строке sport_odds
  for (const analysis of parsed.analyses) {
    await db
      .from('sport_odds')
      .update({ ai_value: analysis.ai_value })
      .eq('sport_event_id', sport_event_id)
      .eq('bookmaker', analysis.bookmaker)
      .eq('market_type', analysis.market_type)
  }

  // Обновляем ai_score в unified_events если найден value
  const maxValue = Math.max(...parsed.analyses.map(a => a.ai_value?.value_rating || 0))
  if (maxValue > 0) {
    await db
      .from('unified_events')
      .update({ ai_score: maxValue })
      .eq('source_id', sport_event_id)
      .eq('source_type', 'sport')
  }

  logger.info('Sport odds analysis saved', { sportEventId: sport_event_id, maxValue })
}
