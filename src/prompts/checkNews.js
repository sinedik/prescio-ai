export const CHECK_NEWS_SYSTEM = `You check for breaking news using primary sources only.
Search: AP News, Reuters, BBC, ISW only.
Ignore: Twitter, Reddit, opinion sites.
Return ONLY valid JSON.`

export function buildCheckNewsPrompt(event) {
  return `Has there been any SIGNIFICANT new development
in the last 2 hours related to: "${event.title}"?
Last checked: ${event.last_news_check_at || 'never'}

Significant means: military action, official government statement,
major policy change, election result, price move >10%, breaking news.
NOT significant: analysis pieces, social media posts, minor updates.

Return ONLY this JSON:
{
  "has_news": true,
  "significance": "high|medium|low",
  "headline": "one line summary if has_news is true",
  "source": "AP|Reuters|BBC|ISW"
}`
}
