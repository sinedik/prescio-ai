import { callWithTools } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'

const CHECK_NEWS_SYSTEM = `You check for breaking news using primary sources only.
Search: AP News (apnews.com), Reuters (reuters.com), BBC (bbc.com), ISW (understandingwar.org) only.
Ignore: Twitter, Reddit, opinion sites.
Return ONLY valid JSON. No text outside JSON.`

export async function checkNews(job, db) {
  const { event_id } = job

  const { data: event } = await db
    .from('events')
    .select('*')
    .eq('id', event_id)
    .single()

  if (!event) throw new Error(`Event not found: ${event_id}`)

  logger.info('Checking news', { eventId: event_id, title: event.title })

  const { textBlocks, depth } = await callWithTools({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: CHECK_NEWS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Has there been any SIGNIFICANT new development in the last 2 hours related to: "${event.title}"?
Last checked: ${event.last_news_check_at || 'never'}

Significant means: military action, official government statement, major policy change, election result, price move >10%, breaking news.
NOT significant: analysis pieces, social media posts, minor updates.

Return ONLY this JSON:
{
  "has_news": true,
  "significance": "high|medium|low",
  "headline": "one line summary if has_news is true",
  "source": "AP|Reuters|BBC|ISW",
  "recent_news": ["news item 1"],
  "sentiment": "positive|negative|neutral",
  "key_developments": ["development 1"]
}`,
    }],
  }, {})

  logger.info('News check tool loop', { eventId: event_id, depth })

  const text = textBlocks.map(b => b.text).join('')
  const result = parseJsonSafe(text)

  // Обновляем event_analyses.news_context через upsert (не создаём новую запись)
  if (result) {
    const newsContext = {
      recent_news:      result.recent_news || (result.headline ? [result.headline] : []),
      sentiment:        result.sentiment || 'neutral',
      key_developments: result.key_developments || [],
      checked_at:       new Date().toISOString(),
    }

    await db
      .from('event_analyses')
      .upsert(
        { event_id, news_context: newsContext },
        { onConflict: 'event_id', ignoreDuplicates: false }
      )
  }

  await db
    .from('events')
    .update({ last_news_check_at: new Date().toISOString() })
    .eq('id', event_id)

  if (result?.has_news && result.significance !== 'low') {
    logger.info('Significant news found, queuing event analysis', {
      eventId: event_id,
      headline: result.headline,
    })
    await db.from('analysis_queue').insert({
      event_id,
      triggered_by: 'analyze_event',
      priority:     2,
      status:       'pending',
    })
  }

  logger.info('News check done', { eventId: event_id, hasNews: result?.has_news })
}
