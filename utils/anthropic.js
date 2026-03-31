import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import { logger } from './logger.js'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

// Один вызов с timeout
export async function callWithTimeout(params) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('Anthropic call timed out')),
    config.worker.callTimeoutMs
  )

  try {
    const response = await client.messages.create(
      { ...params, stream: false },
      { signal: controller.signal }
    )
    return response
  } finally {
    clearTimeout(timer)
  }
}

// Tool-use loop с depth limit
// Автоматически обрабатывает tool_use → tool_result циклы
export async function callWithTools(params, handlers = {}) {
  const messages = [...(params.messages || [])]
  let depth = 0
  const maxDepth = config.worker.toolLoopMaxDepth

  while (depth < maxDepth) {
    const response = await callWithTimeout({ ...params, messages })
    depth++

    const { stop_reason, content } = response

    const textBlocks = content.filter(b => b.type === 'text')
    const toolUseBlocks = content.filter(b => b.type === 'tool_use')

    // Если нет tool_use или достигли end_turn — возвращаем
    if (stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      return { response, textBlocks, depth }
    }

    if (depth >= maxDepth) {
      logger.warn('Tool loop depth limit reached', { depth, maxDepth })
      return { response, textBlocks, depth, limitReached: true }
    }

    // Обрабатываем tool_use
    const toolResults = []
    for (const toolUse of toolUseBlocks) {
      let result = null
      if (handlers[toolUse.name]) {
        result = await handlers[toolUse.name](toolUse.input)
      } else {
        // web_search и другие встроенные инструменты — Anthropic обрабатывает сам
        result = '[Tool executed by Anthropic]'
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    }

    // Добавляем в историю и продолжаем
    messages.push({ role: 'assistant', content })
    messages.push({ role: 'user', content: toolResults })
  }

  throw new Error(`Tool loop exceeded max depth ${maxDepth}`)
}

export { client }
