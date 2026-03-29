import { supabase } from '../lib/supabase.js'
import { callHaiku, parseJSON } from '../lib/claude.js'
import { GROUP_MARKETS_SYSTEM, buildGroupMarketsPrompt } from '../prompts/groupMarkets.js'

export async function groupMarkets(marketIds) {
  const { data: markets } = await supabase
    .from('markets')
    .select('id, question, platform, volume_usd')
    .in('id', marketIds)

  if (!markets?.length) return

  const text = await callHaiku(GROUP_MARKETS_SYSTEM, buildGroupMarketsPrompt(markets), false)
  const result = parseJSON(text)

  if (!result?.events) return

  for (const eventData of result.events) {
    const { data: event } = await supabase
      .from('events')
      .upsert({
        slug: eventData.slug,
        title: eventData.title,
        summary: eventData.summary,
        category: eventData.category,
        importance: eventData.importance,
        tags: eventData.tags || [],
        status: 'active',
        grouped_by_ai: true
      }, { onConflict: 'slug' })
      .select().single()

    if (event) {
      const matchingMarkets = markets.filter(m =>
        eventData.market_questions.includes(m.question)
      )
      if (matchingMarkets.length > 0) {
        await supabase.from('markets')
          .update({ event_id: event.id })
          .in('id', matchingMarkets.map(m => m.id))
      }
    }
  }

  console.log(`[groupMarkets] Created ${result.events.length} events`)
}
