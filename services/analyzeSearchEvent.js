import { callWithTools } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { buildSearchEventPrompt } from '../prompts/searchEvent.js'

export async function analyzeSearchEvent(job, db) {
  const { user_search_id } = job

  const { data: search } = await db
    .from('user_searches')
    .select('*')
    .eq('id', user_search_id)
    .single()

  if (!search) throw new Error(`UserSearch not found: ${user_search_id}`)

  logger.info('Analyzing search event', { searchId: user_search_id, query: search.query })

  const { textBlocks } = await callWithTools({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: buildSearchEventPrompt(),
    messages: [{
      role: 'user',
      content: `Analyze this query for prediction market intelligence:
"${search.query}"

Previous web results context:
${JSON.stringify(search.web_results?.slice(0, 5) || [])}

Return JSON only with full event analysis.`,
    }],
  })

  const text = textBlocks.map(b => b.text).join('')
  const parsed = parseJsonSafe(text)

  if (!parsed) throw new Error(`Failed to parse search event analysis: ${user_search_id}`)

  const dynamicEvent = {
    title:       parsed.title,
    summary:     parsed.summary,
    key_factors: parsed.key_factors,
    probability: parsed.probability,
    edge_score:  parsed.edge_score,
    category:    parsed.category,
    sources:     parsed.sources,
    analyzed_at: new Date().toISOString(),
  }

  const updates = {
    dynamic_event: dynamicEvent,
    category:      parsed.category,
  }

  // Если качество высокое (edge_score > 0.3) — создаём unified_event
  if (parsed.edge_score > 0.3 && parsed.title) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000)

    const { data: unified } = await db
      .from('unified_events')
      .insert({
        source_type: 'prediction',
        source_id:   user_search_id,
        source_name: 'user_search',
        category:    parsed.category,
        title:       parsed.title,
        description: parsed.summary,
        ai_score:    parsed.edge_score,
        status:      'active',
        enriched_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (unified) {
      updates.unified_event_id = unified.id
      logger.info('Created unified_event from search', {
        searchId:  user_search_id,
        unifiedId: unified.id,
      })
    }
  }

  await db.from('user_searches').update(updates).eq('id', user_search_id)

  logger.info('Search event analysis saved', { searchId: user_search_id })
}
