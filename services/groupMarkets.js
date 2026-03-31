import { callWithTimeout } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'

const GROUP_MARKETS_SYSTEM = `You group prediction markets into real-world events.
An event is a real-world situation that multiple markets are betting on.
Return ONLY valid JSON. No text outside JSON.`

export async function groupMarkets(job, db) {
  const marketIds = job.metadata?.market_ids || []

  if (!marketIds.length) {
    logger.warn('groupMarkets: no market_ids in job metadata', { jobId: job.id })
    return
  }

  const { data: markets } = await db
    .from('markets')
    .select('id, question, platform, volume_usd')
    .in('id', marketIds)

  if (!markets?.length) return

  logger.info('Grouping markets', { count: markets.length })

  const response = await callWithTimeout({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: GROUP_MARKETS_SYSTEM,
    messages: [{
      role: 'user',
      content: `Group these prediction markets into logical real-world events.

MARKETS:
${markets.map((m, i) => `${i + 1}. "${m.question}" [${m.platform}] Vol: ${formatVol(m.volume_usd)}`).join('\n')}

IMPORTANCE RULES:
- critical: >$50M total volume OR major geopolitical event
- high: >$10M OR significant political/economic event
- medium: >$1M
- low: everything else

CATEGORIES: geopolitics|elections|crypto|policy|ai_tech|economics|sport

Return ONLY this JSON:
{
  "events": [
    {
      "title": "Short descriptive event name",
      "slug": "kebab-case-max-50-chars",
      "category": "geopolitics|elections|crypto|policy|ai_tech|economics|sport",
      "importance": "critical|high|medium|low",
      "summary": "One sentence describing the event",
      "tags": ["tag1", "tag2"],
      "market_questions": ["exact question text 1", "exact question text 2"]
    }
  ],
  "ungrouped": ["questions that don't fit any event"]
}`,
    }],
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  const result = parseJsonSafe(text)

  if (!result?.events) return

  for (const eventData of result.events) {
    const { data: event } = await db
      .from('events')
      .upsert({
        slug:          eventData.slug,
        title:         eventData.title,
        summary:       eventData.summary,
        category:      eventData.category,
        importance:    eventData.importance,
        tags:          eventData.tags || [],
        status:        'active',
        grouped_by_ai: true,
      }, { onConflict: 'slug' })
      .select()
      .single()

    if (event) {
      const matchingMarkets = markets.filter(m =>
        eventData.market_questions.includes(m.question)
      )
      if (matchingMarkets.length > 0) {
        await db
          .from('markets')
          .update({ event_id: event.id })
          .in('id', matchingMarkets.map(m => m.id))
      }

      // Ставим в очередь анализ созданного события
      await db.from('analysis_queue').insert({
        event_id:     event.id,
        triggered_by: 'analyze_event',
        priority:     5,
        status:       'pending',
      })
    }
  }

  logger.info('Markets grouped', { eventsCreated: result.events.length })
}

function formatVol(v) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}
