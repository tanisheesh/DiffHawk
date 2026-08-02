# DiffHawk — Architecture

Companion to [PRD.md](./PRD.md). This document is the technical design an implementer builds from — component breakdown, data flow, and the exact contracts between pieces.

## 1. Components

```
src/
  webhook/      Express route(s) that receive + verify GitHub webhook deliveries, enqueue jobs
  queue/        BullMQ queue + worker setup, job definitions, retry/backoff config
  github/       Octokit client factory (GitHub App auth), diff fetching, posting PR reviews
  claude/       Anthropic SDK client, system prompt, diff chunking, response parsing/validation
  email/        Email client, summary template rendering, send
  config/       Env var loading/validation (single source of truth for required vars)
  index.js      Process entrypoint(s) — see §6 on process topology
```

### Webhook receiver
- Express app exposing `POST /webhooks/github`.
- Verifies `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET` using HMAC-SHA256, constant-time compare. Reject (401) on mismatch before touching the payload.
- Only acts on `X-GitHub-Event: pull_request` with `action` in `{opened, reopened, synchronize}`. All other events return 200 immediately (acknowledged, ignored) — GitHub will keep redelivering and eventually disable the hook if anything 4xx/5xxs.
- Builds the job payload (see §3) and enqueues it, then returns 200. Does **not** await the review — that happens in the worker. Target ack time: <2s.

### Queue (BullMQ + Redis)
- One queue: `pr-review`.
- Job ID = idempotency key (see §3) so BullMQ itself rejects duplicate enqueues for the same head SHA instead of needing app-level dedupe logic.
- Worker concurrency from `WORKER_CONCURRENCY` (default 3).
- Retry: 3 attempts, exponential backoff starting at 30s, only for errors classified as transient (see §5).

### GitHub client
- Authenticates as the GitHub App using `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`, then mints a short-lived **installation token** per job using the `installationId` from the webhook payload (`@octokit/auth-app`). Never uses a personal access token.
- Fetches changed files: `GET /repos/{owner}/{repo}/pulls/{pr}/files` (paginated).
- Posts results: `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` — one review per job, with `event: COMMENT` and a `comments[]` array anchored to `path` + `line` for each finding, plus a `body` summary at the top (severity counts + overall verdict line).

### Claude client
- Calls the Anthropic API with the system prompt described in §4.
- One request per PR job (diff chunks are concatenated into the user message with clear file boundaries, up to the token budget — see §4.3); large PRs that exceed budget get a second pass noted in the review body ("N files skipped due to size, see below").
- Validates the response against the expected JSON schema before using it; a malformed response is treated as a transient failure and retried (model output is occasionally non-conformant — retry with a stricter reminder rather than crash).

### Email client
- Sends one email per completed job via the provider's HTTP API (see SETUP.md for provider choice).
- Template: subject = `[DiffHawk] {repo} PR #{number}: {verdict}`; body = severity counts table + top findings inline + link to the PR.

## 2. End-to-end flow

1. Developer pushes a commit to a PR branch on `DevPulse`.
2. GitHub sends a `pull_request` (`synchronize`) webhook to `POST /webhooks/github`.
3. Webhook receiver verifies signature, checks action is relevant, builds job payload, enqueues to `pr-review` with job ID = idempotency key, returns 200.
4. A free worker slot picks up the job.
5. Worker mints an installation token, fetches the PR's changed files.
6. Worker chunks the diff (§4.3), sends to Claude with the system prompt, gets back structured findings.
7. Worker posts a single PR review (inline comments + summary body) via Octokit.
8. Worker renders and sends the summary email.
9. Job marked complete. On any step 5–8 throwing a transient error, BullMQ retries the whole job (idempotent — re-fetching and re-posting is safe; GitHub reviews are additive but each job posts a fresh review, so a retry after partial failure may produce a duplicate review in the rare case the GitHub post succeeded but the email step then threw — acceptable for v1, noted as a known limitation rather than solved with a saga/compensation step).

## 3. Job payload shape

```jsonc
{
  "id": "{installationId}-{owner}/{repo}-{prNumber}-{headSha}", // idempotency key / BullMQ job id
  "installationId": 12345678,
  "owner": "alex-handle",
  "repo": "DevPulse",
  "prNumber": 42,
  "headSha": "a1b2c3d...",
  "prTitle": "Add OAuth refresh flow",
  "prUrl": "https://github.com/alex-handle/DevPulse/pull/42"
}
```

## 4. Claude review contract

### 4.1 System prompt strategy
Fixed scope, no exceptions: the prompt restricts the model to exactly three finding categories —
- `bug` — correctness issues: logic errors, off-by-one, null/undefined handling, race conditions, incorrect API usage.
- `security` — OWASP-class issues: injection, broken auth, hardcoded secrets, unsafe deserialization, SSRF, path traversal, missing input validation at trust boundaries.
- `style` — naming, dead code, inconsistent formatting/conventions relative to the rest of the diff, missing error handling for cases that *can* happen.

The prompt explicitly instructs the model:
- Only report findings you are confident about from the diff shown; do not invent issues to appear thorough.
- If there is nothing to report in a category, omit it — do not pad output with restated code or praise.
- Output **only** the JSON object described below — no prose before or after.

### 4.2 Response schema
```jsonc
{
  "summary": "one-line overall verdict",
  "findings": [
    {
      "file": "src/auth/refresh.ts",
      "line": 88,
      "severity": "blocker" | "major" | "minor" | "nit",
      "category": "bug" | "security" | "style",
      "message": "Refresh token is logged in plaintext on failure."
    }
  ]
}
```
`findings` may be an empty array — that is a valid, expected "clean PR" result, not an error.

### 4.3 Diff chunking & budget
- Each changed file becomes one labeled chunk (`--- file: path ---` + its patch).
- Running token estimate accumulated per file; once `MAX_DIFF_TOKENS` is reached, remaining files are **not** sent — their paths are collected and reported in the review body as "not reviewed (PR too large for single pass)" rather than silently dropped.
- Binary/generated files (lockfiles, build output) are skipped before token counting even starts.

## 5. Error classification (for retry policy)
- **Transient (retry)**: GitHub/Anthropic 5xx, network timeout, rate-limit (429) responses, malformed-but-parseable-looking model output.
- **Permanent (no retry, log + drop)**: webhook signature failure, missing installation permissions (403 on a required scope), PR payload missing required fields.

## 6. Process topology
Two logical roles, can run as one process or two depending on Railway service sizing:
- **API process**: webhook receiver only (must stay responsive for GitHub's ack window).
- **Worker process**: BullMQ worker consuming `pr-review`.

Start as a single Node process running both (simplest Railway footprint) with the option to split into two Railway services later if the worker's GitHub/Claude calls start starving webhook responsiveness.

## 7. Environment variables

| Variable | Purpose |
|---|---|
| `GITHUB_APP_ID` | GitHub App identifier, used to mint installation tokens |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM), used to sign the app JWT |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret to verify incoming webhook signatures |
| `ANTHROPIC_API_KEY` | Claude API auth |
| `ANTHROPIC_MODEL` | Model id to use for reviews (tunable for cost/quality) |
| `EMAIL_API_KEY` | Email provider API key |
| `EMAIL_FROM` | Sender address for summary emails |
| `EMAIL_TO` | Recipient address for summary emails |
| `REDIS_URL` | Redis connection string (Railway-provided) |
| `WORKER_CONCURRENCY` | Max concurrent review jobs (default 3) |
| `MAX_DIFF_TOKENS` | Token budget per review request, drives §4.3 |
