export const config = {
  seed: {
    enabled: process.env.SEED_MODE === 'true',
  },
  worker: {
    maxRetries:           3,
    retryDelayMs:         2000,
    toolLoopMaxDepth:     5,
    callTimeoutMs:        60_000,
    analysisExpiresHours: 2,
    maxConcurrentJobs:    3,
    maxConcurrentSonnet:  2,
  },
}
