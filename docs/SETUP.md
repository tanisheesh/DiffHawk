# DiffHawk — Setup Guide

End-to-end steps: GitHub App → local dev → Railway deploy. See [ARCHITECTURE.md](./ARCHITECTURE.md) for env var details.

---

## 1. Create the GitHub App (one command)

```bash
npm run setup
```

This opens GitHub in your browser with all permissions pre-filled. Click **"Create GitHub App"** — one click. The script exchanges the code for credentials and writes `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` directly into `.env.local`.

## 2. Fill remaining env vars

Copy `.env.example` → `.env.local` (if not already there) and fill in:

```
GROQ_API_KEY=          # groq.com → API Keys
GROQ_MODEL=llama-3.3-70b-versatile

EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=you@gmail.com
EMAIL_SMTP_PASS=       # Gmail: Settings → Security → App Passwords
EMAIL_FROM=you@gmail.com
EMAIL_TO=you@gmail.com

REDIS_URL=redis://localhost:6379   # local Redis; Railway injects this automatically
```

## 3. Install the App on target repos

After `npm run setup` completes, the browser shows an **"Install on repos →"** link. Click it and select:
- `DiffHawk` (this repo)
- `DevPulse`
- `InterviewOS`

Adding more repos later: GitHub App settings → Install App → configure.

## 4. Local development

Start Redis (Docker):
```bash
docker run -d -p 6379:6379 redis
```

Run Next.js and worker in two terminals:
```bash
npm run dev          # terminal 1 — Next.js on localhost:3000
npm run worker:dev   # terminal 2 — BullMQ worker
```

For GitHub webhooks to reach localhost, use a tunnel:
```bash
npx smee-client --url https://smee.io/<your-channel> --path /api/webhooks/github --port 3000
```
Set your smee.io channel URL as the webhook URL in GitHub App settings during development.

Open a test PR on any installed repo → review comment appears on GitHub, summary email arrives, dashboard at `localhost:3000` updates.

## 5. Deploy on Railway

Railway runs two services from this repo — both share the same Redis plugin and env vars.

### Service 1 — Web (Next.js + webhook receiver)

1. Railway dashboard → New Project → Deploy from GitHub → select `DiffHawk`.
2. Add **Redis** plugin — Railway injects `REDIS_URL` automatically.
3. Set env vars (copy from `.env.local`, replace `REDIS_URL` with Railway's injected value):
   - `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
   - `GROQ_API_KEY`, `GROQ_MODEL`
   - `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `EMAIL_FROM`, `EMAIL_TO`
   - `WORKER_CONCURRENCY`, `MAX_DIFF_TOKENS`
4. Build command: `npm ci && npm run build` · Start command: `node .next/standalone/server.js`
5. Assign a public domain. Copy the URL.
6. **GitHub App settings → Webhook URL** → paste `https://<railway-url>/api/webhooks/github`. Set active ✓.

### Service 2 — Worker (BullMQ)

1. Railway dashboard → New Service → GitHub repo (same repo, same branch).
2. **No** public domain needed.
3. Build command: `npm ci` · Start command: `npm run worker`
4. Same env vars as Service 1 (or use Railway's shared variable groups).

## 6. Verify

- Open or update a PR on `DevPulse` or `InterviewOS`.
- Within ~2 minutes: inline review comments appear on GitHub + summary email arrives.
- Dashboard at your Railway URL shows the job with findings breakdown.
- Railway logs: `job.enqueued → job.started → job.completed`.
