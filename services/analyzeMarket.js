import { callWithTimeout } from '../utils/anthropic.js'
import { parseJsonSafe } from '../utils/parseJson.js'
import { logger } from '../utils/logger.js'
import { config } from '../config.js'
import { buildMarketPrompt } from '../prompts/market.js'

export async function analyzeMarket(job, db) {
  const { market_id } = job

  const { data: market } = await db
    .from('markets')
    .select('*')
    .eq('id', market_id)
    .single()

  if (!market) throw new Error(`Market not found: ${market_id}`)

  const eventId = market.event_id
  let eventAnalysis = null
  if (eventId) {
    const { data } = await db
      .from('event_analyses')
      .select('*')
      .eq('event_id', eventId)
      .single()
    eventAnalysis = data
  }

  logger.info('Analyzing market', {
    marketId: market_id,
    question: market.question,
    yesPrice: market.yes_price,
    hasEventContext: !!eventAnalysis,
  })

  const response = await callWithTimeout({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a prediction market trading analyst. Return ONLY valid JSON. No text outside JSON.',
    messages: [{
      role: 'user',
      content: buildMarketPrompt(market, eventAnalysis),
    }],
  })

  const text = response.content.find(b => b.type === 'text')?.text || ''
  const parsed = parseJsonSafe(text)

  if (!parsed) throw new Error(`Failed to parse market analysis for ${market_id}`)

  const expiresAt = new Date(Date.now() + config.worker.analysisExpiresHours * 3600_000)

  const { error } = await db
    .from('market_analyses')
    .upsert({
      market_id,
      fair_prob:        parsed.fair_prob,
      market_prob:      market.yes_price,
      edge_score:       parsed.edge_score,
      confidence_score: parsed.confidence_score,
      kelly_fraction:   parsed.kelly_fraction,
      recommendation:   parsed.recommendation,
      thesis:           parsed.thesis,
      crowd_bias:       parsed.crowd_bias,
      resolution_note:  parsed.resolution_note,
      risk_factors:     parsed.risk_factors,
      model_used:       'claude-sonnet-4-6',
      expires_at:       expiresAt.toISOString(),
    }, { onConflict: 'market_id' })

  if (error) throw error

  logger.info('Market analysis saved', {
    marketId: market_id,
    edgeScore: parsed.edge_score,
    recommendation: parsed.recommendation,
  })
}
