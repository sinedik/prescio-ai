import { logger } from './logger.js'

export function parseJsonSafe(text, fallback = null) {
  if (!text) return fallback

  // Пробуем прямой парсинг
  try {
    return JSON.parse(text)
  } catch {}

  // Вырезаем из markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim())
    } catch {}
  }

  // Ищем первый { ... } блок
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {}
  }

  // Ищем первый [ ... ] блок (для массивов)
  const arrStart = text.indexOf('[')
  const arrEnd = text.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1))
    } catch {}
  }

  logger.warn('parseJsonSafe: all strategies failed', { textSnippet: text.slice(0, 100) })
  return fallback
}
