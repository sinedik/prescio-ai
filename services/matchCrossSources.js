import { callWithTimeout } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { buildCrossSourcePrompt } from '../prompts/crossSource.js'

export async function matchCrossSources(job, db) {
  const { sport_event_id } = job

  const { data: sportEvent } = await db
    .from('sport_events')
    .select('*')
    .eq('id', sport_event_id)
    .single()

  if (!sportEvent) throw new Error(`SportEvent not found: ${sport_event_id}`)

  // Получаем unified_event для этого sport_event
  const { data: sportUnified } = await db
    .from('unified_events')
    .select('id')
    .eq('source_id', sport_event_id)
    .eq('source_type', 'sport')
    .single()

  if (!sportUnified) {
    logger.warn('No unified_event for sport_event', { sport_event_id })
    return
  }

  // Берём топ-30 prediction market events той же категории в окне ±7 дней от матча
  const startWindow = new Date(sportEvent.starts_at)
  startWindow.setDate(startWindow.getDate() - 7)
  const endWindow = new Date(sportEvent.starts_at)
  endWindow.setDate(endWindow.getDate() + 7)

  const { data: candidates } = await db
    .from('unified_events')
    .select('id, title, description, source_name, starts_at')
    .eq('source_type', 'prediction')
    .eq('category', sportEvent.category)
    .gte('starts_at', startWindow.toISOString())
    .lte('starts_at', endWindow.toISOString())
    .limit(30)

  if (!candidates?.length) {
    logger.info('No candidates for cross-source match', { sport_event_id })
    return
  }

  logger.info('Matching cross sources', {
    sportEventId: sport_event_id,
    match: `${sportEvent.home_team} vs ${sportEvent.away_team}`,
    candidates: candidates.length,
  })

  const response = await callWithTimeout({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildCrossSourcePrompt(),
    messages: [{
      role: 'user',
      content: `Sport event: ${sportEvent.home_team} vs ${sportEvent.away_team}
League: ${sportEvent.league}, Subcategory: ${sportEvent.subcategory}
Date: ${sportEvent.starts_at}

Prediction market candidates:
${JSON.stringify(candidates.map(c => ({ id: c.id, title: c.title, starts_at: c.starts_at })))}

Find matches. Return JSON only:
{
  "matches": [
    {
      "unified_event_id": "uuid",
      "link_type": "same_match|related",
      "confidence": 0.0,
      "reason": "short explanation"
    }
  ]
}
Return empty matches array if no good match found (confidence < 0.7).`,
    }],
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  const parsed = parseJsonSafe(text)

  if (!parsed?.matches?.length) {
    logger.info('No cross-source matches found', { sport_event_id })
    return
  }

  // Фильтруем по confidence >= 0.7
  const goodMatches = parsed.matches.filter(m => m.confidence >= 0.7)

  for (const match of goodMatches) {
    await db.from('event_links').upsert({
      event_a_id:   sportUnified.id,
      event_b_id:   match.unified_event_id,
      link_type:    match.link_type,
      confidence:   match.confidence,
      linked_by_ai: true,
    }, { onConflict: 'event_a_id,event_b_id', ignoreDuplicates: false })

    logger.info('Event link created', {
      sportUnifiedId: sportUnified.id,
      predictionId:   match.unified_event_id,
      confidence:     match.confidence,
    })
  }
}
