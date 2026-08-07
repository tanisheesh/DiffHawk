# Local Setup — DiffHawk

> **Just want to try it?** Use the live demo at [diffhawk.up.railway.app](https://diffhawk.up.railway.app) — no setup needed.
> This guide is for running DiffHawk locally or deploying it yourself on Railway.

---

## Prerequisites

- Node.js 20+
- Redis (`redis-server` or Docker: `docker run -p 6379:6379 redis`)
- A [GitHub App](https://github.com/settings/apps/new) — or run `npm run setup` to create one automatically (see Step 1)
- A [GitHub OAuth App](https://github.com/settings/developers) for dashboard login

---

## 1. Clone and install

```bash
git clone https://github.com/tanisheesh/DiffHawk
cd DiffHawk
npm install
cp .env.example .env.local
```

---

## 2. Create the GitHub App (automated)

```bash
npm run setup
```

This opens GitHub in your browser with all required permissions pre-filled. Click **"Create GitHub App"** — one click. The script writes `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` directly into `.env.local`.

After the script completes, the browser shows an **"Install on repos"** link. Click it and select the repos you want DiffHawk to review (e.g., DiffHawk, DevPulse, InterviewOS). You can add more repos later from GitHub App settings without redeploying.

---

## 3. Environment variables

Fill in the remaining values in `.env.local`:

| Variable | Where to get it | Required |
|---|---|---|
| `GITHUB_APP_ID` | Set by `npm run setup` | Yes |
| `GITHUB_APP_PRIVATE_KEY` | Set by `npm run setup` (full PEM, newlines as `\n`) | Yes |
| `GITHUB_WEBHOOK_SECRET` | Set by `npm run setup` | Yes |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys | Yes |
| `GROQ_MODEL` | Default: `llama-3.3-70b-versatile` | No |
| `NEXTAUTH_URL` | `http://localhost:3001` for local dev | Yes |
| `NEXTAUTH_SECRET` | Run `openssl rand -hex 32` | Yes |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub → Settings → Developer settings → OAuth Apps | Yes |
| `GITHUB_OAUTH_CLIENT_SECRET` | Same OAuth App → Client secrets | Yes |
| `ALLOWED_GITHUB_LOGINS` | Comma-separated GitHub usernames allowed to view the dashboard | Yes |
| `REDIS_URL` | Default: `redis://localhost:6379` (Railway injects automatically) | No |
| `WORKER_CONCURRENCY` | Default: `3` | No |
| `MAX_DIFF_TOKENS` | Default: `30000` | No |
| `DAILY_REVIEW_LIMIT` | Default: `50` (set `0` to disable) | No |
| `EMAIL_SMTP_HOST` | e.g. `smtp.gmail.com` (omit entirely to disable email) | No |
| `EMAIL_SMTP_PORT` | Default: `587` | No |
| `EMAIL_SMTP_USER` | Your Gmail address | No |
| `EMAIL_SMTP_PASS` | Gmail → Settings → Security → App Passwords | No |
| `EMAIL_FROM` | Sender address | No |
| `EMAIL_TO` | Recipient address for review summaries | No |

---

## 4. Run locally

Start Redis, the web server, and the worker in separate terminals:

```bash
# Terminal 0 — Redis (if not already running)
docker run -d -p 6379:6379 redis

# Terminal 1 — Next.js web server + webhook receiver
npm run dev
# Starts on http://localhost:3001

# Terminal 2 — BullMQ worker
npm run worker:dev
```

Forward GitHub webhooks to localhost using smee.io:

```bash
npx smee-client --url https://smee.io/<your-channel> \
  --path /api/webhooks/github --port 3001
```

Set your smee.io channel URL as the webhook URL in GitHub App settings during development.

Open a PR on any installed repo → inline review comments appear on GitHub, a summary email arrives, and the dashboard at `http://localhost:3001` shows the job.

### Test a webhook without opening a real PR

```bash
TEST_INSTALLATION_ID=<id> \
TEST_HEAD_SHA=<any-commit-sha> \
TEST_REPO=owner/repo \
  node --env-file=.env.local --import=tsx scripts/test-webhook.ts
```

---

## 5. Deploy to Railway

Railway runs two services from the same repo. Both share one Redis plugin and the same env vars.

### Service 1 — Web (Next.js + webhook receiver)

1. Railway dashboard → New Project → Deploy from GitHub → select `DiffHawk`.
2. Add **Redis** plugin — Railway injects `REDIS_URL` automatically into both services.
3. Set env vars from `.env.local` (replace `NEXTAUTH_URL` with the Railway-assigned public URL).
4. Build command: `npm ci && npm run build`
5. Start command: `node .next/standalone/server.js`
6. Assign a public domain. Copy the URL and paste it into **GitHub App settings → Webhook URL**: `https://<railway-url>/api/webhooks/github`. Check **Active**.

### Service 2 — Worker (BullMQ)

1. Railway dashboard → New Service → GitHub repo (same repo, same branch).
2. No public domain needed.
3. Build command: `npm ci`
4. Start command: `npm run worker`
5. Same env vars as Service 1 (use Railway shared variable groups).

### Verify

Open or update a PR on any installed repo. Within ~30 seconds:
- Inline review comments appear on the GitHub PR.
- Summary email arrives (if SMTP is configured).
- Dashboard at your Railway URL shows the completed job with findings breakdown.
- Railway logs show: `job.enqueued → job.started → job.completed`.

---

## Known local-only limitations

- GitHub webhooks require a public URL — use the smee.io tunnel for local testing.
- The dashboard shows jobs from the current Redis instance only; jobs processed in production are not visible in local dev (different Redis).
- `npm run worker:dev` uses `--watch` mode which restarts the worker on file changes — in-flight jobs may be interrupted. Use `npm run worker` (no watch) if you need stable job processing.
