function log(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    service: 'prescio-ai',
    message,
    ...meta,
  }
  console.log(JSON.stringify(entry))
}

export const logger = {
  info:  (msg, meta) => log('info', msg, meta),
  warn:  (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
}
