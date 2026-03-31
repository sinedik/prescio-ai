import { callWithTools } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { config } from '../config.js'
import { buildEventPrompt } from '../prompts/event.js'

export async function analyzeEvent(job, db) {
  const { event_id } = job

  const { data: event, error } = await db
    .from('events')
    .select('*, markets(*)')
    .eq('id', event_id)
    .single()

  if (error || !event) throw new Error(`Event not found: ${event_id}`)

  const markets = event.markets || []
  logger.info('Analyzing event', { eventId: event_id, title: event.title, markets: markets.length })

  const { textBlocks, depth } = await callWithTools({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: buildEventPrompt(event),
    messages: [{
      role: 'user',
      content: `Analyze this prediction market event and return JSON only.
Event: ${event.title}
Markets: ${markets.map(m => m.question).join(', ')}
Current prices: ${markets.map(m => `${m.question}: YES ${m.yes_price}`).join(', ')}`,
    }],
  })

  logger.info('Event analysis tool loop', { eventId: event_id, depth })

  const text = textBlocks.map(b => b.text).join('')
  const parsed = parseJsonSafe(text)

  if (!parsed) throw new Error(`Failed to parse event analysis for ${event_id}`)

  const expiresAt = new Date(Date.now() + config.worker.analysisExpiresHours * 3600_000)

  const { error: upsertError } = await db
    .from('event_analyses')
    .upsert({
      event_id,
      summary:         parsed.summary,
      key_factors:     parsed.key_factors,
      probability:     parsed.probability,
      edge_score:      parsed.edge_score,
      kelly_fraction:  parsed.kelly_fraction,
      scenarios:       parsed.scenarios,
      news_context:    parsed.news_context,
      model_used:      'claude-sonnet-4-6',
      web_search_used: true,
      expires_at:      expiresAt.toISOString(),
    }, { onConflict: 'event_id' })

  if (upsertError) throw upsertError

  // Обновляем ai_score в unified_events
  await db
    .from('unified_events')
    .update({ ai_score: parsed.edge_score, enriched_at: new Date().toISOString() })
    .eq('source_id', event_id)
    .eq('source_type', 'prediction')

  // Каскадно ставим в очередь анализ каждого маркета
  for (const market of markets) {
    await db.from('analysis_queue').insert({
      market_id:    market.id,
      triggered_by: 'analyze_market',
      priority:     6,
      status:       'pending',
    })
  }

  logger.info('Event analysis saved', { eventId: event_id })
}
