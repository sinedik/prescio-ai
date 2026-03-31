export const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  worker: {
    maxRetries: 3,
    retryDelayMs: 2000,
    toolLoopMaxDepth: 5,
    callTimeoutMs: 60_000,
    analysisExpiresHours: 2,
  },
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY']
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`)
}
