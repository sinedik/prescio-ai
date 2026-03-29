import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { processJob } from './worker.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

console.log('╔══════════════════════════╗')
console.log('║  Prescio AI Worker v1.0  ║')
console.log('╚══════════════════════════╝')

// ТОЛЬКО Realtime — никакого polling, никакого старта
supabase
  .channel('ai_queue')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'analysis_queue'
  }, async (payload) => {
    const job = payload.new
    if (job.status === 'pending') {
      console.log('[realtime] New job:', job.id)
      await processJob(job)
    }
  })
  .subscribe(status => console.log('[realtime]', status))

console.log('[worker] Ready. Waiting for jobs via Realtime...')

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down')
  process.exit(0)
})
