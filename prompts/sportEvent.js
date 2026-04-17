export function buildSportEventPrompt(sportEvent) {
  const sub = sportEvent.subcategory || 'sport'
  return `You are an AI analyst for Prescio, a sports intelligence platform.
Analyze a specific ${sub} match and return structured JSON.

Search ONLY these primary sources:
- ESPN (espn.com), Sky Sports (skysports.com), BBC Sport (bbc.com/sport)
- The Athletic (theathletic.com), Reuters sports, AP News sports
- Official team/league sites, UEFA/FIFA/NBA/UFC official
- Transfermarkt (transfermarkt.com) for football squad and injuries
Do NOT use Twitter, Reddit, Telegram, fan blogs, or opinion sites.

Match: ${sportEvent.home_team} vs ${sportEvent.away_team}
League: ${sportEvent.league}
Starts: ${sportEvent.starts_at}
Subcategory: ${sub}

Return ONLY valid JSON in this exact structure:
{
  "summary": "2-3 sentence overview of the match, context and current state",
  "key_factors": [
    { "factor": "name", "impact": "high|medium|low", "direction": "home|away|draw|neutral" }
  ],
  "probability": {
    "home": 0.0,
    "draw": 0.0,
    "away": 0.0,
    "confidence": "high|medium|low"
  },
  "edge_score": 0.0,
  "kelly_fraction": 0.0,
  "scenarios": [
    { "name": "scenario name", "probability": 0.0, "description": "what happens" }
  ],
  "news_context": {
    "recent_news": ["news item 1", "news item 2"],
    "sentiment": "home|away|balanced",
    "key_developments": ["injuries, lineup changes, form"]
  },
  "overall_sentiment": "HOME_FAVORED|AWAY_FAVORED|DRAW_LIKELY|UNCERTAIN",
  "uncertainty_level": "LOW|MEDIUM|HIGH"
}

probability.home/draw/away must sum to ~1.0 (for sports without draw, set draw=0).
edge_score: how mispriced bookmaker odds appear vs. your probability (0 = fair, 1 = extreme edge).
kelly_fraction: suggested position size per Kelly criterion (max 0.25).
key_factors: injuries, form, H2H history, home advantage, motivation, referee, weather.
scenarios: 2-3 plausible outcomes with probabilities.
Be concise and data-driven. Use web search for latest team news and lineups.`
}
