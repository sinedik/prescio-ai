import { logger } from './logger.js'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Exponential backoff: 2s, 4s, 8s
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    delayMs = 2000,
    label = 'operation',
  } = options

  let lastError
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const isLast = attempt === maxRetries

      // Anthropic rate limit — ждём дольше
      if (err?.status === 429) {
        const retryAfter = parseInt(err?.headers?.['retry-after'] || '60') * 1000
        logger.warn('Rate limited, waiting', { label, attempt, retryAfter })
        if (!isLast) await sleep(retryAfter)
        continue
      }

      // Не ретраим если это наша логическая ошибка
      if (err?.status >= 400 && err?.status < 500 && err?.status !== 429) {
        throw err
      }

      logger.warn('Attempt failed', { label, attempt, maxRetries, error: err.message })
      if (!isLast) await sleep(delayMs * Math.pow(2, attempt - 1))
    }
  }
  throw lastError
}
