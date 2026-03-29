import 'dotenv/config'
import http from 'http'
import { createClient } from '@supabase/supabase-js'
import { processJob } from './worker.js'

const PORT = parseInt(process.env.PORT || '8080')

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] Port ${PORT} open`)
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

console.log('╔══════════════════════════╗')
console.log('║  Prescio AI Worker v1.0  ║')
console.log('╚══════════════════════════╝')

supabase
  .channel('ai_queue')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'analysis_queue'
  }, async (payload) => {
    if (payload.new?.status === 'pending') {
      console.log('[realtime] New job:', payload.new.id)
      await processJob(payload.new)
    }
  })
  .subscribe(status => console.log('[realtime]', status))

console.log('[worker] Ready.')

process.on('SIGTERM', () => {
  server.close()
  process.exit(0)
})
