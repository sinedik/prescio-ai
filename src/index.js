import 'dotenv/config'
import http from 'http'
import { supabase } from './lib/supabase.js'
import { processJob, startPolling } from './worker.js'

const PORT = parseInt(process.env.PORT || '8080')

const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] Port ${PORT} open`)
})

console.log('[prescio-ai] starting')

// Realtime subscription for instant response to new jobs
supabase
  .channel('ai_queue')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'analysis_queue'
  }, async (payload) => {
    if (payload.new?.status === 'pending') {
      console.log('[realtime] New job:', payload.new.id)
      processJob(payload.new)
    }
  })
  .subscribe(status => console.log('[realtime] Realtime subscription status:', status))

// Polling fallback — catches missed events, processes backlog
startPolling()

console.log('[worker] Starting prescio-ai worker')

process.on('SIGTERM', () => {
  server.close()
  process.exit(0)
})
