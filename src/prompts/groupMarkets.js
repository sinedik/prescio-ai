export const GROUP_MARKETS_SYSTEM = `You group prediction markets into real-world events.
An event is a real-world situation that multiple markets are betting on.
Return ONLY valid JSON. No text outside JSON.`

export function buildGroupMarketsPrompt(markets) {
  return `Group these prediction markets into logical real-world events.

MARKETS:
${markets.map((m, i) =>
  `${i+1}. "${m.question}" [${m.platform}] Vol: ${formatVol(m.volume)}`
).join('\n')}

IMPORTANCE RULES:
- critical: >$50M total volume OR major geopolitical event
- high: >$10M OR significant political/economic event
- medium: >$1M
- low: everything else

CATEGORIES: geopolitics|elections|crypto|policy|ai_tech|economics

Return ONLY this JSON:
{
  "events": [
    {
      "title": "Short descriptive event name",
      "slug": "kebab-case-max-50-chars",
      "category": "geopolitics|elections|crypto|policy|ai_tech|economics",
      "importance": "critical|high|medium|low",
      "summary": "One sentence describing the event",
      "tags": ["tag1", "tag2"],
      "market_questions": ["exact question text 1", "exact question text 2"]
    }
  ],
  "ungrouped": ["questions that don't fit any event"]
}`
}

function formatVol(v) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`
  return `$${v}`
}
