# DiffHawk — Product Requirements Document

**Status:** Final
**Owner:** Tanish Poddar
**One-liner:** Automated GitHub PR code reviewer — installs as a GitHub App, posts inline diff comments and a severity-ranked email summary within 30 seconds of a PR being opened.

---

## 1. Problem

Code review is the last line of defence before a bug ships, but it's also the part of the development cycle most commonly skipped or rushed on solo and small-team projects. Developers working on personal or portfolio repos rarely have a second set of eyes — security issues like hardcoded secrets, SQL injection, and missing auth checks go unnoticed until they're already in production. Existing static analysis tools require per-repo configuration and catch only a narrow class of issues; AI-assisted review products cost $15–$40/month per seat and require a SaaS account. There is no low-friction option for a developer to get real, contextual code review on every PR across their own repos without manual work.

---

## 2. Goals (v1 / MVP)

1. Install once as a GitHub App — review all selected repos without any per-repo configuration.
2. Automatically review every PR opened or updated within 30 seconds of the webhook delivery.
3. Post inline review comments anchored to exact diff lines (not just a summary comment).
4. Classify every finding as Blocker, Major, Minor, or Nit across three categories: Security, Bug, Style.
5. Send a formatted severity-ranked HTML email summary on every completed review.
6. Handle multiple simultaneous PRs across multiple repos without blocking or dropping any review.
7. Never block GitHub's webhook delivery window (ack within 2 seconds).
8. Deployed with a working live demo on Railway.

---

## 3. Non-Goals (explicit scope cuts)

- **Merge gating** — No GitHub Check Runs / required status checks. Reviews are advisory only in v1; blocking merges is a v2 decision requiring more confidence in false-positive rate.
- **Web dashboard in v1** — Implemented (dashboard exists in v1 for visibility into job state), but not a primary deliverable. The dashboard is a bonus, not a requirement.
- **Non-GitHub VCS** — GitLab, Bitbucket, Azure DevOps are out of scope. GitHub App covers the author's entire workflow.
- **Per-line auto-fix / commit-back** — Comments only. Committing AI-suggested fixes adds risk of broken builds; deferred until review quality is validated.
- **Multi-tenant billing** — v1 is for personal use; no pricing, no per-user isolation of costs or email routing.
- **Fine-tuned model** — Uses Groq's hosted Llama 3.3-70B via a crafted system prompt. Custom fine-tuning is a v2 consideration if the prompt-based approach proves insufficient.

---

## 4. Users

**Primary:** The author (Tanish Poddar), reviewing PRs on personal and portfolio repos (DiffHawk, DevPulse, InterviewOS). Every PR made during development of those projects is auto-reviewed live — the tool is its own proof of work.

**Secondary:** Any developer who installs the GitHub App on their own repos. The design avoids hardcoded single-user assumptions (installation tokens are per-installation, rate limits are per-installation, the GitHub App is a standard multi-tenant app architecture) so expansion is feasible without a rewrite.

---

## 5. User Stories

1. *As a repo owner,* when I open or push to a PR, I want an automated review comment to appear on the diff within 30 seconds, flagging real bugs, security risks, and style issues anchored to specific lines.
2. *As a repo owner,* I want a severity-ranked email summary immediately after the review completes so I know whether anything needs attention before I close my laptop.
3. *As a repo owner,* if I push three PRs across three repos at the same time, I want all three reviewed concurrently — one slow diff should not delay the others.
4. *As a repo owner,* if Groq or GitHub is briefly unavailable, I want the review to retry automatically (up to 3 times with backoff) rather than silently disappear.
5. *As a repo owner,* I want to add a new repo (e.g., InterviewOS) to auto-review coverage just by installing the GitHub App on it — no code changes, no redeployment.
6. *As a developer checking the dashboard,* I want to see a history of recent reviews with their findings breakdown so I can verify the system is working and revisit past results.

---

## 6. Functional Requirements

### 6.1 GitHub Integration

- Ship as a GitHub App (not per-repo webhooks) — single app, installed on the author's account, covering any selected repos.
- Subscribe to `pull_request` webhook events: `opened`, `reopened`, `synchronize`.
- Verify every incoming webhook using HMAC-SHA256 with `timingSafeEqual` before processing; reject with 401 on mismatch.
- Use GitHub App installation tokens (short-lived, 1h expiry, scoped to declared permissions) to call the GitHub API — never a personal access token.
- Required permissions: Pull Requests (Read & write), Contents (Read-only), Metadata (Read-only).

### 6.2 Webhook Receiver

- Ack every webhook within 2 seconds (enqueue + return 200; do not await the review).
- Enforce a configurable per-installation daily review cap (`DAILY_REVIEW_LIMIT`, default 50) via Redis INCR. Fail open if Redis is unreachable — reviews proceed.
- Use a deterministic job ID (`{installationId}-{owner}/{repo}-{prNumber}-{headSha}`) so duplicate webhook deliveries for the same commit are deduplicated by BullMQ automatically.

### 6.3 Diff Handling

- Fetch changed files via `GET /repos/{owner}/{repo}/pulls/{pr}/files` (paginated, up to 100 per page).
- Skip binary files, lockfiles, minified assets, and build output before token counting.
- Enforce `MAX_DIFF_TOKENS` budget (default 30,000): files that would exceed the budget are listed in the review body as skipped rather than silently dropped or causing a job failure.

### 6.4 AI Review

- System prompt restricts the model to three categories (bug, security, style) and four severity levels (blocker, major, minor, nit).
- Prompt explicitly forbids inventing findings; empty findings array is a valid "clean PR" result.
- Response is validated against the expected JSON schema; unknown severity/category values are coerced with a warning log. Unparseable responses are treated as permanent failures (no retry).
- Model and token budget are configurable via env vars without code changes.

### 6.5 Posting Results

- Post one GitHub PR Review per job with inline `comments[]` anchored to file + line and a severity count table in the review body.
- Send one HTML email per completed review to the configured recipient; email failure does not fail or retry the job.
- If zero findings, both the PR comment and email must explicitly say "reviewed, no issues found" — silence is indistinguishable from failure.

### 6.6 Queue & Reliability

- BullMQ queue with Redis backing — 3 retry attempts, exponential backoff starting at 30s.
- Permanent failures (auth errors, malformed payload, permanent GitHub errors) do not retry and are logged with reason.
- Transient failures (5xx, network timeout, secondary rate limits) are retried up to 3 times.
- Worker concurrency configurable via `WORKER_CONCURRENCY` (default 3).

### 6.7 Dashboard

- GitHub OAuth login via NextAuth v4 — no separate signup flow.
- Access restricted to `ALLOWED_GITHUB_LOGINS` allowlist; returns 503 if allowlist is empty rather than allowing any authenticated GitHub user.
- Displays recent jobs (up to 30 completed, 10 failed, 5 active, 5 waiting) with expandable findings panels.
- Polls every 15 seconds for live updates.

---

## 7. Non-Functional Requirements

- **Latency:** Webhook ack < 2s. End-to-end review (PR opened → comment posted) < 2 minutes for a typical PR (< 500 changed lines).
- **Security:** Webhook signature verification mandatory. All secrets in env vars only — never committed. CSP nonce per request (`script-src 'nonce-...' 'strict-dynamic'`). Dashboard access via explicit allowlist.
- **Cost:** Single oversized PR must not exhaust API budget — hard token cap with graceful partial-review fallback.
- **Reliability:** No review job silently lost — every webhook follows a logged path (enqueued → started → completed or failed with reason).
- **Observability:** Structured JSON logs per lifecycle event — sufficient to diagnose a missing review after the fact without attaching a debugger.

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| End-to-end review time | PR webhook → inline comment posted in < 2 minutes |
| Webhook ack time | < 2 seconds on every delivery |
| Review reliability | No missed reviews under simultaneous load (3+ PRs at once) |
| Real issues caught | At least one real bug or security issue caught during own development (not a synthetic test) |
| App availability | App installed and actively reviewing PRs on DiffHawk, DevPulse, InterviewOS |

---

## 9. Risks & Open Questions

- **Groq rate limits** — Free tier has request-per-minute limits. Mitigated by per-installation daily cap and BullMQ concurrency ceiling (default 3 parallel jobs).
- **Duplicate reviews on retry** — If the GitHub review post succeeds but a subsequent step (email) throws, the job retries and may post a second review. Acceptable for v1; a "posted" flag in Redis would fix this in v2.
- **Prompt injection** — Diff content could contain instructions to the model. Mitigated by wrapping diff in `<diff>` tags marked as untrusted and instructing the model not to follow instructions found within them. Not fully airtight.
- **Open question** — Should severity ≥ blocker eventually wire into a GitHub Check Run to gate merges? Deliberately deferred — advisory-only is safer until false-positive rate is validated.

---

## 10. v2 Candidates

- **GitHub Check Runs integration** — Post findings as a Check Run so blockers can optionally gate merges via branch protection rules.
- **Persistent job history** — Postgres-backed store (Neon serverless) so review history survives a Redis restart.
- **Per-installation email routing** — Allow each installation to configure its own `EMAIL_TO` rather than a single global recipient.
- **Duplicate-review guard** — Persist a "review posted" flag per job ID in Redis so retries after partial failure don't repost.
- **Dashboard improvements** — Filtering, search, per-repo views, trend charts.
