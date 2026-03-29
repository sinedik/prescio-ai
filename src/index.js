import 'dotenv/config'
import { supabase } from './lib/supabase.js'
import { processJob } from './worker.js'

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

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down')
  process.exit(0)
})
