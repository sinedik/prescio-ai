# prescio-ai

AI microservice for Prescio — processes analysis jobs from a Supabase queue using Claude.

## Stack

- **Node.js** (ESM)
- **Anthropic Claude** (claude-opus-4-5 / sonnet)
- **Supabase** (job queue via `analysis_queue` table)
- **Railway** (deployment)

## How It Works

The worker polls `analysis_queue` for pending jobs, dispatches to the appropriate handler, writes results back to Supabase, and marks the job as `completed` or `failed`.

```
analysis_queue (pending)
       ↓
   worker.js  →  handler  →  Claude API
       ↓
analysis_queue (completed) + result table
```

## Setup

```bash
npm install
cp .env.example .env
node index.js
```

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `POLL_INTERVAL_MS` | Queue poll interval (default: `3000`) |

## Job Handlers

Jobs are identified by the `triggered_by` field in `analysis_queue`:

| `triggered_by` | Handler | Description |
|---|---|---|
| `analyze_market` | `services/analyzeMarket.js` | Analyze a prediction market for edge opportunities |
| `analyze_event` | `services/analyzeEvent.js` | Generate intelligence report for an event |
| `analyze_sport_odds` | `services/analyzeSportOdds.js` | Analyze bookmaker odds for value bets |
| `match_cross_sources` | `services/matchCrossSources.js` | Match same event across different platforms |
| `check_news` | `services/checkNews.js` | Check news relevance for a market |
| `group_markets` | `services/groupMarkets.js` | Group related markets into events |
| `ai_search` | `services/analyzeSearchEvent.js` | Semantic search over prediction markets |

## Project Structure

```
worker.js          Main polling loop
config.js          Environment config
db.js              Supabase client
index.js           Entry point (starts worker + keepalive)
prompts/           Claude prompt templates
  market.js
  event.js
  sportOdds.js
  crossSource.js
  searchEvent.js
services/          Job handler implementations
  analyzeMarket.js
  analyzeEvent.js
  analyzeSportOdds.js
  matchCrossSources.js
  checkNews.js
  groupMarkets.js
  analyzeSearchEvent.js
utils/
  anthropic.js     Claude client wrapper
  logger.js        Structured logging
  parseJson.js     Robust JSON extraction from LLM output
  retry.js         Exponential backoff retry
```

## Queue Schema (Supabase)

```sql
analysis_queue (
  id           uuid primary key,
  triggered_by text,           -- handler name
  payload      jsonb,          -- input data
  status       text,           -- pending | processing | completed | failed
  result       jsonb,          -- output from Claude
  error        text,
  created_at   timestamptz,
  updated_at   timestamptz
)
```
