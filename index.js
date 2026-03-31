import 'dotenv/config'
import http from 'http'
import { startWorker } from './worker.js'
import { logger } from './utils/logger.js'

logger.info('prescio-ai starting')

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) })
  process.exit(1)
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

// Лёгкий HTTP сервер для Railway health check
const PORT = parseInt(process.env.PORT || '3000')
const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
})
server.listen(PORT, '0.0.0.0', () => {
  logger.info('HTTP health check server started', { port: PORT })
})

startWorker()
logger.info('prescio-ai worker started, listening for analysis_queue events')
