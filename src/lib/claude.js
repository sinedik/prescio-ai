import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function callSonnet(system, prompt, useSearch = false) {
  const params = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: prompt }]
  }

  if (useSearch) {
    params.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
  }

  let response = await client.messages.create(params)
  let messages = [{ role: 'user', content: prompt }]

  while (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse) break

    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: ''
      }]
    })

    response = await client.messages.create({ ...params, messages })
  }

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export async function callHaiku(system, prompt, useSearch = false) {
  const params = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: prompt }]
  }

  if (useSearch) {
    params.tools = [{ type: 'web_search_20250305', name: 'web_search' }]
  }

  const response = await client.messages.create(params)

  return response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export function parseJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[claude] No JSON found in response:', text.slice(0, 200))
      return null
    }
    return JSON.parse(match[0])
  } catch (err) {
    console.error('[claude] JSON parse error:', err.message)
    console.error('[claude] Raw text:', text.slice(0, 200))
    return null
  }
}

export function formatVolume(vol) {
  if (!vol) return '$0'
  if (vol >= 1e9) return `$${(vol/1e9).toFixed(1)}B`
  if (vol >= 1e6) return `$${(vol/1e6).toFixed(1)}M`
  if (vol >= 1e3) return `$${(vol/1e3).toFixed(0)}K`
  return `$${vol}`
}
