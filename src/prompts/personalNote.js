export const PERSONAL_NOTE_SYSTEM = `You give personalized prediction market trading advice.
Return ONLY valid JSON. No text outside JSON.`

export function buildPersonalNotePrompt(market, analysis, profile) {
  const multiplier = {
    beginner: 0.25,
    experienced: 0.5,
    pro: 1.0
  }[profile.trading_experience || 'beginner'] || 0.25

  const typicalStake = profile.typical_stake_usd || 50
  const personalKelly = +(analysis.kelly_fraction * multiplier).toFixed(1)
  const personalStake = +(typicalStake * personalKelly / 100).toFixed(0)

  return `Give personalized trading advice for this trader.

MARKET: "${market.question}"
RECOMMENDATION: ${analysis.recommendation}
EDGE SCORE: ${analysis.edge_score}pp
BASE KELLY: ${analysis.kelly_fraction}%
THESIS: ${analysis.thesis}

TRADER PROFILE:
Experience: ${profile.trading_experience || 'beginner'}
Typical stake: $${typicalStake}
Kelly multiplier: ${multiplier}x (${profile.trading_experience || 'beginner'} level)

Calculated values:
Personal kelly: ${personalKelly}%
Recommended stake: $${personalStake}

Return ONLY this JSON:
{
  "personal_kelly": ${personalKelly},
  "personal_stake_usd": ${personalStake},
  "note": "2 sentences. Specific advice considering their experience and stake size.",
  "warning": "risk warning if beginner or edge > 20pp, null otherwise"
}`
}
