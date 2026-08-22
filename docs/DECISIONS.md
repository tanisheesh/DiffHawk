# Engineering Decisions — DiffHawk

<!--
This is not user documentation. This is for technical interviewers
and senior engineers who want to understand WHY the system is built
the way it is. Every entry answers a question an interviewer might ask.
-->

---

## Decision 1 — Why Groq over Claude or GPT-4

**Context:** The review pipeline needs to complete end-to-end in under 30 seconds from webhook receipt to GitHub comment posted. The LLM call is the dominant latency contributor. Claude Sonnet and GPT-4 Turbo can take 15–30s+ for large prompts on a free/low-tier account; that window is acceptable for batch jobs but slow when a developer is actively waiting at their terminal.

**Decision:** Groq SDK with `llama-3.3-70b-versatile` as the default model, configurable via `GROQ_MODEL`.

**Reason:** Groq's LPU hardware delivers inference in 1–3 seconds for typical PR diffs, keeping total pipeline time well under 30 seconds even after network round-trips to GitHub. Llama 3.3-70B is capable enough for the scoped review task (three categories, structured JSON output) without needing a frontier reasoning model.

**Tradeoff:** Groq's model catalogue is narrower than OpenAI or Anthropic. Llama 3.3-70B may miss subtle security issues that Claude Opus or GPT-4o would catch. The system prompt compensates by being explicit about OWASP categories, but the quality ceiling is lower. Groq also has stricter free-tier rate limits than some alternatives.

---

## Decision 2 — Why BullMQ + Redis over processing reviews inline in the webhook handler

**Context:** GitHub requires webhook acknowledgement within 10 seconds, or it marks the delivery as failed and begins redelivering. A full review cycle — minting a GitHub token, paginating the diff, calling Groq (1–60s depending on diff size and load), posting the review to GitHub — routinely takes 30–90 seconds.

**Decision:** BullMQ queue backed by Redis. The webhook handler enqueues a job and returns 200 immediately; a separate worker process handles the actual review asynchronously.

**Reason:** The decoupling is required for correctness: processing inline would cause GitHub to retry failed deliveries, producing duplicate review comments. BullMQ also provides retry with exponential backoff, a dead-letter queue, and structured job state (active/completed/failed) at no extra code cost — all features that would need to be hand-written against a plain `setImmediate` approach.

**Tradeoff:** Adds operational complexity: Redis must be running, the worker is a separate process/service. Reviewing a PR is no longer a simple request–response — it requires monitoring logs or the dashboard to confirm a review was posted. Railway's managed Redis plugin minimises the operational burden for this specific deployment target.

---

## Decision 3 — Why GitHub App tokens over a personal access token

**Context:** The app needs to post review comments to GitHub repositories on behalf of the installed app. Two authentication options exist: a personal access token (PAT) scoped to the author's account, or GitHub App installation tokens.

**Decision:** GitHub App with installation tokens minted per job via `@octokit/auth-app`.

**Reason:** Installation tokens are scoped exactly to the permissions declared when creating the app (Pull Requests R/W + Contents R), are short-lived (1-hour expiry, minted fresh each job), and are tied to the installation rather than the owner's account. A leaked token from a single job cannot be replayed after expiry and cannot access other GitHub resources outside the declared scope. A PAT would have broad account access, never expire by default, and need to be manually rotated if compromised.

**Tradeoff:** GitHub App setup is significantly more complex than dropping a PAT into an env var: the app must be created, a private key generated and stored, and the installation flow completed. The setup script (`npm run setup`) automates most of this, but it is still more friction than a PAT for initial configuration.

---

## Decision 4 — Why a per-installation daily cap via Redis INCR rather than no rate limiting

**Context:** A misconfigured GitHub App installation, a repo with a high-volume bot, or a malicious actor who discovers the webhook endpoint could flood the review queue and exhaust Groq API credits in minutes. Without a cap, a single installation could issue hundreds of jobs per day.

**Decision:** Redis INCR with a 25-hour TTL key (`ratelimit:{installationId}:{YYYY-MM-DD}`). Default cap: 50 reviews per installation per day. Cap is configurable via `DAILY_REVIEW_LIMIT`; set to 0 to disable.

**Reason:** Redis INCR is atomic and O(1) — no lock contention even under simultaneous webhook bursts. The 25-hour TTL (not exactly 24h) prevents a reset at midnight UTC from allowing a double-spend at the boundary. The fail-open design means Redis unavailability does not block reviews — better to process an extra review than silently drop one.

**Tradeoff:** The cap resets at UTC midnight (calendar-day window), not a rolling 24-hour window, so a burst at 23:59 UTC followed by another burst at 00:01 UTC gets double the limit. Exceeded-limit webhooks return HTTP 200 (so GitHub does not retry), meaning the PR author gets no feedback that their review was skipped — a silent skip is arguably worse than an explicit error in this case.

---

## Decision 5 — Why email failure is isolated from job success

**Context:** The review job has two outputs: a GitHub PR review comment and a summary email. Both are useful, but the GitHub comment is the primary deliverable — the email is a notification convenience. A transient SMTP failure should not cause the whole job to fail, which would trigger a retry that could post a duplicate GitHub review.

**Decision:** Email send is wrapped in an isolated `try/catch` inside `processReview`. Email failure is logged as `email.failed` but does not throw — the job is marked completed regardless.

**Reason:** The GitHub review has already been posted by the time email runs. If email failure caused a job failure, BullMQ would retry the entire job: re-fetch the diff, re-call Groq, re-post the GitHub review (duplicate comment), then possibly succeed or fail on email again. The email step is a side-channel notification with no idempotency guarantee on the SMTP side, so retrying it risks duplicate emails without fixing the root cause.

**Tradeoff:** A persistent SMTP misconfiguration (wrong password, wrong host) will silently swallow email errors without any dashboard-visible signal — only the `email.failed` log entry indicates the problem. There is no alerting on repeated email failures in v1.

---

## What I'd do differently in v2

- **Duplicate-review guard** — Persist a `"review-posted"` flag in Redis keyed by job ID immediately after the GitHub review API call succeeds. On retry, check the flag and skip the post step if it is already set. This eliminates the duplicate-review risk on retry after a downstream failure (email, etc.).
- **Postgres-backed job history** — The dashboard currently reads from Redis, which is a transient queue store. A Redis restart clears all job history. A lightweight Neon serverless Postgres table (`id, repo, pr_number, findings_json, completed_at`) would survive restarts and enable richer querying (per-repo history, trend charts, severity over time).
- **Per-installation email routing** — Store a `email_to` address per installation in Postgres so each repo owner gets their own summary emails rather than everything going to a single configured address.

---

## Explicit non-decisions (deferred to v2)

| Feature | Why deferred |
|---|---|
| GitHub Check Runs / merge gating | Advisory-only reviews are safer until false-positive rate is validated on real code. Blocking merges on AI output needs higher confidence. |
| Per-line auto-fix commit-back | Committing AI-suggested code changes risks broken builds. Comments-only keeps the author in control of what actually merges. |
| GitLab / Bitbucket support | GitHub covers 100% of the author's workflow. Multi-VCS would require abstract webhook normalization and separate app registrations. |
| Fine-tuned model | Prompt engineering is sufficient for the scoped task (3 categories, structured JSON). Fine-tuning is expensive and requires a labelled dataset the project doesn't yet have. |
| Multi-tenant billing / SaaS | v1 is personal use. A public SaaS requires per-installation cost accounting, payment integration, and support infrastructure — a separate project in scope. |
