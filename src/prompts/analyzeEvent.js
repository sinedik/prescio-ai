export const ANALYZE_EVENT_SYSTEM = `You are a prediction market intelligence analyst.
Search ONLY these primary sources:
- ISW (understandingwar.org) for military/geopolitical events
- AP News (apnews.com) for breaking news
- Reuters (reuters.com) for financial and political news
- BBC (bbc.com) for international events
- Official government sites (.gov, .gov.uk, .gov.ua) for policy
- CoinGecko (coingecko.com) for crypto prices and data
- Polymarket blog for prediction market analysis
Do NOT use Twitter, Reddit, Telegram, or opinion sites.
Return ONLY valid JSON. No text outside JSON.`

export function buildAnalyzeEventPrompt(event, markets) {
  return `Analyze this prediction market event using latest information from primary sources.

EVENT: "${event.title}"
CATEGORY: ${event.category}
IMPORTANCE: ${event.importance}
TAGS: ${(event.tags || []).join(', ')}

RELATED PREDICTION MARKETS:
${markets.map(m => `
- "${m.question}"
  Platform: ${m.platform} | YES: ${m.yes_price}% | Volume: ${formatVol(m.volume_usd)}
  Resolves: ${m.resolution_date}
  Criteria: ${m.resolution_criteria || 'Standard platform rules'}
`).join('')}

Search primary sources for latest developments. Focus on facts, dates, official statements.

Return ONLY this JSON:
{
  "situation_summary": "2-3 sentences with specific facts and dates",
  "key_factors": [
    {
      "factor": "factor name",
      "description": "one sentence explanation",
      "impact": "bullish|bearish|neutral",
      "weight": 0.0
    }
  ],
  "primary_sources": [
    {
      "name": "AP|Reuters|BBC|ISW|Official",
      "url": "url if found",
      "excerpt": "key finding in one sentence",
      "date": "YYYY-MM-DD"
    }
  ],
  "overall_sentiment": "very_bullish|bullish|neutral|bearish|very_bearish",
  "uncertainty_level": "very_high|high|medium|low",
  "next_key_date": "YYYY-MM-DD or null"
}`
}

function formatVol(v) {
  if (!v) return '$0'
  if (v >= 1e9) return `$${(v/1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}K`
  return `$${v}`
}
