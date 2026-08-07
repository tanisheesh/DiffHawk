# DiffHawk — Architecture

<!--
Companion to PRD.md.
PRD says WHAT the system does. This says HOW.
Audience: an engineer who needs to understand the system well
enough to build it, debug it, or extend it.
-->

---

## 1. Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, `output: standalone`) |
| Auth | NextAuth v4 · GitHub OAuth (JWT session strategy) |
| Queue | BullMQ 6 · IORedis · Redis |
| AI | Groq SDK · `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`) |
| GitHub | @octokit/rest 22 · @octokit/auth-app 8 (App installation tokens) |
| Email | Nodemailer 9 · Gmail SMTP (optional — disabled when `EMAIL_SMTP_HOST` is unset) |
| Styling | Tailwind CSS 4 · Barlow / Barlow Condensed (Google Fonts) |
| Hosting | Railway — Web service + Worker service + Redis plugin |

---

## 2. Components

```
src/
  app/
    api/webhooks/github/   Webhook receiver — HMAC verify, rate-limit check, enqueue
    api/jobs/              Dashboard API — reads job history from BullMQ queue
    api/health/            Health check endpoint (Railway liveness probe)
    api/auth/[...nextauth] NextAuth handler — GitHub OAuth
    dashboard/             Dashboard page — job list + expandable findings panel
    page.tsx               Landing page — sign-in, how-it-works, CTA
  components/
    Logo.tsx               HawkEye SVG + DiffHawk wordmark
  lib/
    config.ts              Env var loading/validation — single source of truth
    auth.ts                NextAuth config — GitHub provider, JWT callbacks
    queue.ts               BullMQ queue definition (3 attempts, exponential backoff)
    github.ts              Octokit factory, diff fetching, review posting
    groq.ts                Groq SDK client, system prompt, response parsing/validation
    email.ts               Nodemailer email sender + HTML template
    ratelimit.ts           Per-installation daily cap via Redis INCR
  proxy.ts                 Next.js middleware — CSP nonce injection + dashboard auth guard
worker/
  index.ts                 BullMQ Worker process entrypoint (separate Railway service)
  review.ts                processReview — orchestrates diff fetch, LLM call, post, email
```

### Webhook Receiver (`api/webhooks/github/`)

Receives `POST /api/webhooks/github` from GitHub. Verifies `X-Hub-Signature-256` with HMAC-SHA256 and `timingSafeEqual` before touching the payload. Filters to `pull_request` events with `action` in `{opened, reopened, synchronize}`; all other events return 200 immediately. Runs a per-installation daily cap check (fails open if Redis is unavailable), then enqueues a BullMQ job with a deterministic job ID and returns 200. Does not perform any review work inline.

### BullMQ Queue (`lib/queue.ts`)

One queue: `pr-review`. Job options: 3 attempts, exponential backoff starting at 30s, keep 100 completed / 50 failed jobs for the dashboard. The deterministic job ID (`{installationId}-{owner}/{repo}-{prNumber}-{headSha}`) acts as an idempotency key — BullMQ rejects duplicate enqueues for the same head SHA automatically.

### Worker (`worker/`)

A standalone Node.js process (separate Railway service) consuming the `pr-review` queue. Configurable concurrency (default 3 parallel jobs). On each job: mints a GitHub App installation token, fetches paginated PR diff, calls Groq, posts the GitHub review, sends the summary email. Handles SIGTERM/SIGINT gracefully with a 30s drain window. Structured JSON logs for every lifecycle event (`job.started`, `job.completed`, `job.failed`).

### GitHub Client (`lib/github.ts`)

Wraps `@octokit/rest` with `@octokit/auth-app` to mint short-lived per-job installation tokens. `fetchDiff` paginates `GET /repos/{owner}/{repo}/pulls/{pr}/files`, skips binary/generated files (lockfiles, build artifacts, minified assets), and tracks a running token estimate — files that would exceed `MAX_DIFF_TOKENS` are skipped and listed in the review body. `postReview` maps findings to inline `comments[]` anchored to file + line on the RIGHT side, with a severity summary table in the review body.

### Groq Client (`lib/groq.ts`)

Sends a single chat completion request to Groq with a 60s timeout. System prompt scopes the model to three categories (bug, security, style), four severity levels (blocker, major, minor, nit), and explicitly instructs it not to invent issues. Diff content is wrapped in `<diff>` tags and marked as untrusted to mitigate prompt injection. Response is parsed and validated against the expected schema — unknown severity/category values are coerced to `nit`/`style` with a warning log rather than hard-failing.

### Rate Limiter (`lib/ratelimit.ts`)

Redis INCR with a 25-hour TTL key `ratelimit:{installationId}:{YYYY-MM-DD}`. Returns `{ allowed, remaining }`. Fails open — if Redis is unreachable, reviews proceed rather than being blocked. Set `DAILY_REVIEW_LIMIT=0` to disable entirely.

### Email (`lib/email.ts`)

Nodemailer with Gmail SMTP. Entirely optional — skipped (with a log entry) when `EMAIL_SMTP_HOST` is not set. Isolated in a `try/catch` in the worker: email failure cannot mark the job failed or trigger a retry that would duplicate the GitHub review.

### Middleware / CSP (`src/proxy.ts`)

Next.js middleware applied to all page routes (not API routes). Generates a random 16-byte nonce per request, builds a CSP header with `script-src 'nonce-{nonce}' 'strict-dynamic'` (no `unsafe-inline`), and passes the nonce to Next.js via `x-nonce` request header. Also enforces the dashboard auth guard: routes under `/dashboard` require a valid NextAuth JWT token.

---

## 3. Data Flow

```
GitHub PR opened / synchronized
        │
        ▼
POST /api/webhooks/github
  ├─ HMAC-SHA256 verify (timingSafeEqual)     → 401 on mismatch
  ├─ event/action filter                      → 200 + ignored non-PR events
  ├─ rate-limit check (Redis INCR)            → 200 without enqueue if exceeded
  └─ reviewQueue.add(jobId, payload)          → 200 Accepted
        │
        ▼  (async — BullMQ)
Worker: processReview(job)
  ├─ getInstallationOctokit(installationId)   ← mints short-lived GitHub App token
  ├─ fetchDiff(octokit, owner, repo, prNumber)
  │     ├─ paginate GET /pulls/{pr}/files
  │     ├─ skip binary/generated files
  │     └─ skip files exceeding MAX_DIFF_TOKENS budget
  ├─ reviewDiff(files, skippedFiles, context) → Groq Llama 3.3-70B (60s timeout)
  │     └─ parse + validate JSON response
  ├─ postReview(octokit, ...)
  │     ├─ map findings → inline comments[] (file + line on RIGHT side)
  │     └─ POST /repos/{owner}/{repo}/pulls/{pr}/reviews (event: COMMENT)
  └─ sendSummaryEmail(...)                    ← isolated try/catch
        │
        ▼
Dashboard: GET /api/jobs
  └─ reads completed/failed/active/waiting from BullMQ queue → JSON to browser
```

1. Developer opens or pushes to a PR on a repo with DiffHawk installed.
2. GitHub sends a `pull_request` webhook to `/api/webhooks/github`.
3. Webhook receiver verifies signature, checks rate limit, enqueues job, returns 200.
4. Worker dequeues the job and mints a fresh installation token.
5. Worker fetches changed files, skipping binary/generated files and files over budget.
6. Groq Llama 3.3-70B reviews the diff and returns structured JSON findings.
7. Worker posts a single GitHub PR Review with inline comments + severity summary.
8. Worker sends a severity-ranked HTML email (if SMTP is configured).
9. Dashboard polls `/api/jobs` every 15 seconds to display job history and findings.

---

## 4. AI / LLM Design

### Input

Structured user message containing PR metadata (`owner/repo`, PR number, title) in `<pr-metadata>` tags and the per-file diffs in `<diff>` tags, with clear `--- file: path ---` boundaries. Binary/generated files are excluded before token counting. Files over the `MAX_DIFF_TOKENS` budget are skipped and listed in the review body — never silently dropped.

### System prompt strategy

Fixed scope: three categories only (bug, security, style), four severity levels (blocker, major, minor, nit). The prompt explicitly instructs the model not to invent issues to appear thorough, to return an empty findings array when there is nothing to report, and to output only the JSON object — no prose before or after. Diff content is marked as untrusted user-supplied data to mitigate prompt injection.

### Response schema

```jsonc
{
  "summary": "one-line verdict, e.g. 'No issues found.' or '1 security issue, 2 bugs.'",
  "findings": [
    {
      "file": "src/auth/refresh.ts",
      "line": 88,
      "severity": "blocker" | "major" | "minor" | "nit",
      "category": "bug" | "security" | "style",
      "message": "Concise description of the issue."
    }
  ]
}
```

### Validation

Response is parsed with `JSON.parse`. If unparseable, a `GroqFormatError` is thrown — this is classified as a permanent failure (UnrecoverableError in BullMQ) so it does not retry indefinitely. Unknown severity or category values are coerced to `nit`/`style` with a structured warning log rather than rejected. Markdown fences around the JSON are stripped before parsing.

### Failure handling

Groq client has a 60s timeout. `GroqFormatError` (malformed response) → UnrecoverableError, no retry. HTTP 401/404/422 from GitHub or Groq → UnrecoverableError. HTTP 5xx, network timeouts, secondary rate limits → retried up to 3 times with 30s exponential backoff. Email failure → isolated `try/catch`, job still marked completed.

---

## 5. API Routes

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/webhooks/github` | Receives GitHub PR events, verifies HMAC-SHA256, enqueues review job |
| `GET` | `/api/jobs` | Returns job history from BullMQ queue (requires auth + ALLOWED_GITHUB_LOGINS) |
| `GET` | `/api/health` | Health check — Railway liveness probe |
| `GET/POST` | `/api/auth/[...nextauth]` | NextAuth GitHub OAuth handler |

---

## 6. Security

- **Webhook signature:** HMAC-SHA256 with `timingSafeEqual` — mandatory, enforced before any payload parsing. Returns 401 on mismatch.
- **GitHub tokens:** Short-lived installation tokens (1h expiry) minted per job — never a PAT, never stored.
- **API keys:** All secrets (Groq, GitHub App private key, webhook secret, NextAuth secret) in env vars only, never committed. Validated at startup by `config.ts`.
- **CSP:** Per-request nonce via Next.js middleware — `script-src 'nonce-{nonce}' 'strict-dynamic'`, no `unsafe-inline`.
- **Dashboard access:** Requires valid NextAuth session AND membership in `ALLOWED_GITHUB_LOGINS` allowlist. Returns 503 if allowlist is empty rather than allowing any authenticated user.
- **Prompt injection:** PR metadata and diff content tagged as untrusted in the system prompt; wrapped in XML-style tags so the model treats them as data, not instructions.

---

## 7. Error Handling & Reliability

| Failure | Behaviour |
|---|---|
| Invalid webhook signature | 401 returned immediately — job never enqueued |
| Rate limit exceeded | 200 returned, job silently skipped — GitHub does not retry |
| Queue write fails | 503 returned — GitHub will redeliver the webhook |
| Groq returns malformed JSON | UnrecoverableError — no retry, logged as `job.failed` |
| GitHub 401 / 404 / 422 | UnrecoverableError — no retry |
| GitHub 5xx / network timeout | Retried 3× with 30s exponential backoff |
| Email send fails | Isolated try/catch — job still marked completed, not retried |
| Worker shutdown (SIGTERM) | 30s graceful drain — in-flight jobs finish before process exits |
| Redis unavailable (rate limiter) | Fails open — review proceeds without cap enforcement |

---

## 8. Deployment

1. Railway project with two services from the same GitHub repo — one for the Next.js web server (webhook receiver + dashboard), one for the BullMQ worker.
2. Railway Redis plugin — `REDIS_URL` injected automatically into both services.
3. Web service: `npm ci && npm run build` → `node .next/standalone/server.js`. Public domain assigned and set as the GitHub App webhook URL.
4. Worker service: `npm ci` → `npm run worker`. No public domain needed.
5. All env vars set via Railway dashboard shared variable groups — `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GROQ_API_KEY`, `NEXTAUTH_SECRET`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `ALLOWED_GITHUB_LOGINS`, `EMAIL_*`.
6. Railway liveness probe: `GET /api/health`, 30s timeout, restart on failure (max 3 retries).

---

## 9. Explicit Scope Cuts

- **No merge gating** — Reviews are advisory only. GitHub Check Runs integration (which can gate merges) is a v2 candidate.
- **No per-line auto-fix** — DiffHawk posts comments only; committing suggested changes back to the branch is deferred.
- **No persistent job history** — Job data lives in Redis only; a Redis restart clears the dashboard. A Postgres-backed history store is a v2 candidate.
- **No multi-tenant email config** — v1 sends all summaries to a single configured `EMAIL_TO` address. Per-installation routing would require a user preferences store.
- **No GitLab / Bitbucket support** — GitHub App only in v1.
