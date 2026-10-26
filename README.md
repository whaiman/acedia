# Acedia — Obligation Compiler

Turn a pile of obligations, tasks, deadlines, and dependencies into **one justified next action** with a finish line, a reason, and a list of what can safely wait.

## Core idea

1. **Describe** what you need to do in plain text (deadlines, dependencies, constraints).
2. **Compile** — the app extracts obligations, validates them, and runs a deterministic priority engine.
3. **Act** on the single recommended step. Mark it complete to get the next one.

The priority engine is **pure and deterministic** — same input + same `now` = same output. It never guesses. An obligation is only marked "safe to defer" when it has a verified deadline ≥ 7 days away and is not irreversible. Missing deadlines, unknown dependencies, and irreversible items are **never** classified as safe to defer.

## Quick start

```bash
# Install dependencies
npm install

# Development server (http://localhost:3000)
npm run dev

# Run tests
npm test

# Lint
npm run lint

# Production build
npm run build

# Start production server
npm start
```

## Configuration

The app works fully offline with the rule-based parser. Configure these environment variables to enable LLM-powered obligation extraction:

| Variable                | Required             | Description                                                                                                            |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ACEDIA_LLM_BASE_URL`   | For LLM mode         | OpenAI-compatible base URL (e.g., `http://127.0.0.1:1234/v1` for LM Studio, `https://api.groq.com/openai/v1` for Groq) |
| `ACEDIA_LLM_MODEL`      | For LLM mode         | Model identifier as shown in your server (e.g., `google/gemma-4-e2b`, `qwen/qwen3-32b`)                                |
| `ACEDIA_LLM_API_KEY`    | If provider requires | Bearer token for the inference API (LM Studio usually doesn't need one)                                                |
| `ACEDIA_LLM_TIMEOUT_MS` | Optional             | Request timeout in milliseconds (default: 120000)                                                                      |

Create a `.env` file in the project root:

```bash
# Example for LM Studio (local)
ACEDIA_LLM_BASE_URL=http://127.0.0.1:1234/v1
ACEDIA_LLM_MODEL=google/gemma-4-e2b

# Example for Groq (cloud)
# ACEDIA_LLM_BASE_URL=https://api.groq.com/openai/v1
# ACEDIA_LLM_MODEL=qwen/qwen3-32b
# ACEDIA_LLM_API_KEY=gsk_...
```

### Using Groq for the public demo

1. Get an API key from [Groq Console](https://console.groq.com/keys)
2. Set the three variables above in your hosting platform (Render, Vercel, etc.)
3. The app will automatically use Groq for obligation extraction

### Using a local inference server (LM Studio, llama.cpp, vLLM, Ollama)

1. Start your server with an OpenAI-compatible `/v1/chat/completions` endpoint
2. Set `ACEDIA_LLM_BASE_URL` to your server's base URL (include `/v1`)
3. Set `ACEDIA_LLM_MODEL` to the model name as shown in your server
4. No API key needed for most local servers

## How it works

### 1. Obligation extraction (optional LLM)

- If an LLM is configured, the user's text is sent to an OpenAI-compatible `/chat/completions` endpoint with `temperature=0` and `response_format=json_object`
- **Prompt injection protection**: System prompt explicitly forbids following embedded instructions; user notes are wrapped in `--- USER NOTES START/END ---` delimiters; input is sanitized (control chars removed, backticks escaped, length capped)
- Model output is **validated** against the original text: every `sourceQuote` must appear verbatim; unverified deadlines are dropped; only known fields are kept

### 2. Rule-based parser (fallback / offline)

- One obligation per line or sentence
- Understands ISO dates (`2026-10-30`), "30 October", "October 30", and rolls far-past dates to next year
- Parses `after X and Y` dependencies
- Does NOT understand "Friday", "next week", or implicit dependencies

### 3. Deterministic priority engine (`recommend`)

Pure function. Rules, in order:

1. Only items with no open prerequisites can be chosen
2. Urgent first: effective deadline overdue or within 2 days
3. Enablers first: more open items waiting on it
4. Earlier effective deadline (transitive — includes deadlines of dependents)
5. Irreversible if missed
6. Smaller effort
7. Original input order

**Deferral categories:**

- `waiting` — blocked on unmet dependencies
- `safe` — effective deadline ≥ 7 days away, not irreversible, has a known deadline
- `not-justified` — no deadline, irreversible, or deadline too close (< 7 days)

**The engine never marks an obligation as `safe` to defer merely because a model says so.** Safety is decided solely by verified deadlines and dependency structure.

### 4. Mark complete → next recommendation

Clicking "Mark step complete" sends the updated obligation list (with the chosen item marked `done: true`) back to `/api/compile`, which re-runs `recommend` and returns the next action. No database — completely stateless.

## API

### `POST /api/compile`

Main endpoint. Accepts:

```json
{
  "text": "string (1–4000 chars, required)",
  "obligations?": Obligation[]  // optional, for mark-complete flow
}
```

Returns:

```json
{
  "obligations": Obligation[],
  "result": Result,           // action | needs-info | all-done
  "today": "YYYY-MM-DD",
  "usedModel": boolean,
  "warnings": string[],
  "model?": "string"
}
```

**Rate limit:** 30 requests/minute per IP (in-memory, single-instance demo only). Returns `429` with `Retry-After` header when exceeded. **Not distributed, not persistent, not production-grade.**

### `POST /api/interpret`

Debug endpoint — LLM extraction only, no prioritization. Requires LLM config.

## Known limitations

- **Rule-based parser** doesn't understand relative dates like "Friday", "next week", "in 3 days", or non-English month names
- **No persistence** — refresh loses all state
- **Single-user demo** — in-memory rate limiting resets on server restart
- **LLM fallback** — if the model is slow/unavailable, the app silently falls back to the rule-based parser (shown via a warning badge)
- **Prompt injection protection** reduces risk but doesn't guarantee safety
- **No authentication, no database, no audit log** — intended as a local-first prototype

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Single-page React client
│   └── api/
│       ├── compile/route.ts  # Main endpoint: parse/LLM → validate → recommend
│       └── interpret/route.ts # Debug: LLM extraction only
└── lib/acedia/
    ├── types.ts              # Obligation, Result, Deferral types
    ├── parse.ts              # parseText (rule-based) + validateProposal (LLM output)
    ├── engine.ts             # recommend (pure prioritization) + markDone
    ├── llm.ts                # interpretWithModel (OpenAI-compatible client)
    ├── ids.ts                # Unique ID generation + sanitizeForPrompt
    ├── validate.ts           # Client obligations validation (mark-complete flow)
    ├── rate-limit.ts         # In-memory rate limiter (demo only)
    └── examples.ts           # Dynamic example scenarios
```

## License

MIT
