# DiffHawk

Automated GitHub PR code reviewer. Installs as a GitHub App, receives webhook events, sends the diff to Groq (Llama 3.3 70B), posts **inline review comments** on the PR, and emails a severity-ranked summary — all within ~30 seconds of the PR being opened.

Installed on its own repos (`DiffHawk`, `DevPulse`, `InterviewOS`) — every PR made during development gets auto-reviewed live.

## Live Proof

> **[Add a real PR link here once DiffHawk reviews a PR on this repo]**
>
> Example: open a PR, wait ~30 s, then look for the DiffHawk review comment thread.

<!-- SCREENSHOT: paste a screenshot of DiffHawk's inline review comment here -->

## How It Works

```
GitHub PR opened / synchronized
         │
         ▼
Webhook → HMAC-SHA256 verified → rate-limit check → BullMQ queue (idempotent job ID)
         │
         ▼
Worker dequeues job
  ├─ mints GitHub App installation token (short-lived, per-job)
  ├─ fetches paginated diff  GET /repos/{owner}/{repo}/pulls/{pr}/files
  ├─ sends diff to Groq (Llama 3.3 70B, 60 s timeout)
  │     └─ system prompt: 3 categories (bug / security / style), structured JSON
  ├─ posts ONE review with comments[] anchored to path + line  +  summary body
  └─ sends severity-ranked email  (Gmail SMTP, optional)
```

**Severity levels:** Blocker → Major → Minor → Nit

## Stack

| Layer | Technology |
|-------|-----------|
| Web server | Next.js 16 (App Router, `output: standalone`) |
| Queue | BullMQ + IORedis — 3 retries, exponential backoff from 30 s |
| AI | Groq SDK — `llama-3.3-70b-versatile` |
| GitHub | `@octokit/rest` + `@octokit/auth-app` (App tokens, not PAT) |
| Email | Nodemailer (Gmail SMTP, optional) |
| Auth | NextAuth v4 (GitHub OAuth) |
| Deployment | Railway (web + worker services + Redis plugin) |

## Local Setup

### Prerequisites

- Node.js 20+
- Redis (`redis-server` or Docker: `docker run -p 6379:6379 redis`)
- A [GitHub App](https://github.com/settings/apps/new) with:
  - **Permissions:** Pull requests (read/write), Contents (read)
  - **Webhook URL:** `https://your-domain.com/api/webhooks/github`
  - **Subscribe to:** Pull request events
- A [GitHub OAuth App](https://github.com/settings/developers) for dashboard login

### Install

```bash
npm install
cp .env.example .env.local
# fill in .env.local — see table below
```

### Run

```bash
# Terminal 1 — web server + webhook receiver
npm run dev

# Terminal 2 — queue worker
npm run worker:dev

# Forward webhooks locally (optional)
npx smee -u https://smee.io/YOUR_CHANNEL -t http://localhost:3001/api/webhooks/github
```

### Test a webhook locally

```bash
TEST_INSTALLATION_ID=<id> \
TEST_HEAD_SHA=<any-commit-sha> \
TEST_REPO=owner/repo \
  node --env-file=.env.local --import=tsx scripts/test-webhook.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_APP_ID` | ✅ | — | Numeric ID from GitHub App settings |
| `GITHUB_APP_PRIVATE_KEY` | ✅ | — | Full PEM (newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | — | Secret set when creating the App |
| `GROQ_API_KEY` | ✅ | — | From console.groq.com |
| `GROQ_MODEL` | — | `llama-3.3-70b-versatile` | Model override |
| `NEXTAUTH_URL` | ✅ | — | Full origin (`https://your-app.railway.app`) |
| `NEXTAUTH_SECRET` | ✅ | — | `openssl rand -hex 32` |
| `GITHUB_OAUTH_CLIENT_ID` | ✅ | — | OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | ✅ | — | OAuth App client secret |
| `ALLOWED_GITHUB_LOGINS` | ✅ | — | Comma-separated GitHub usernames for dashboard |
| `REDIS_URL` | — | `redis://localhost:6379` | Redis connection (Railway injects automatically) |
| `WORKER_CONCURRENCY` | — | `3` | Parallel jobs per worker process |
| `MAX_DIFF_TOKENS` | — | `30000` | Token budget per review |
| `DAILY_REVIEW_LIMIT` | — | `50` | Max reviews per installation per day (`0` = no limit) |
| `EMAIL_SMTP_HOST` | — | — | Omit entirely to disable email |
| `EMAIL_SMTP_PORT` | — | `587` | |
| `EMAIL_SMTP_USER` | — | — | |
| `EMAIL_SMTP_PASS` | — | — | Gmail: use an App Password |
| `EMAIL_FROM` | — | — | Sender address |
| `EMAIL_TO` | — | — | Recipient address |

## Railway Deployment

Two services, one Redis plugin:

**Web service** (runs `npm start`)
- Set all env vars from the table above
- `NEXTAUTH_URL` = the public Railway URL

**Worker service** (runs `node --import=tsx worker/index.ts`)
- Same env vars as web service
- Railway injects `REDIS_URL` automatically

## Security

- Webhook HMAC-SHA256 verified with `timingSafeEqual` before any payload parsing
- Per-request CSP nonce injected by Next.js middleware (`script-src 'nonce-...' 'strict-dynamic'` — no `'unsafe-inline'`)
- Dashboard protected by NextAuth session + explicit `ALLOWED_GITHUB_LOGINS` allowlist (503 when not configured)
- All secrets in env vars only — never committed
- GitHub access via short-lived installation tokens (1 h expiry, minted per job)
- Diff content tagged as untrusted in the LLM prompt to mitigate prompt injection

## Job Lifecycle

Nothing is silently dropped — every webhook follows a logged path:

```
webhook received
  └─ bad signature            → 401  (logged)
  └─ rate limit exceeded      → 200, not enqueued  (ratelimit.exceeded log)
  └─ enqueued                 → job.enqueued log
       └─ worker picks up     → job.started log
            └─ success        → review posted + email  → job.completed log
            └─ transient err  → retried 3× (30 s exponential backoff)
            └─ permanent err  → dead-letter            → job.failed log + reason
```

## Stack

Next.js · Groq (Llama 3.3) · BullMQ · Redis · Nodemailer · Octokit · Railway
