import 'dotenv/config'
import { supabase } from './lib/supabase.js'
import { processJob, processPendingJobs } from './worker.js'

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
    if (payload.new.status === 'pending') {
      console.log('[realtime] New job:', payload.new.id)
      await processJob(payload.new)
    }
  })
  .subscribe(status => console.log('[realtime]', status))

setInterval(() => processPendingJobs(3), 30 * 1000)

processPendingJobs(5)

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down')
  process.exit(0)
})
