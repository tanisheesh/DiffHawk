# DiffHawk — Product Requirements Document

## 1. Summary

DiffHawk is an automated code review bot that installs as a GitHub App, listens for pull request events, sends the diff to the Claude API for analysis (bugs, security issues, code style), posts inline review comments on the PR, and emails a formatted summary. Jobs are processed through a Redis-backed queue so multiple PRs across multiple repos can be reviewed concurrently without blocking the webhook receiver.

The project doubles as its own proof of work: it will be installed on the author's own repositories (DiffHawk itself, DevPulse, InterviewOS), so every PR made while building those projects is auto-reviewed live — a running demonstration embedded in the normal build process, not a staged demo.

## 2. Goals

- Automatically review every PR opened/updated on connected repos within minutes of push.
- Catch real bugs, security issues (OWASP-class), and style/convention violations — not generic praise.
- Never block GitHub's webhook delivery (must ack within GitHub's 10s timeout).
- Handle multiple PRs landing simultaneously across multiple repos without one slow review delaying another.
- Produce a result a human will actually read: concise email summary + precise inline PR comments, not a wall of text.
- Be cheap enough to run continuously on personal repos (cost-aware diff handling, model choice, rate limits).

## 3. Non-Goals (v1)

- Not a replacement for human review / approval gating (no merge blocking, no required check by default).
- No web dashboard / UI in v1 — Redis is used as transient queue state, not a queryable history store.
- No support for non-GitHub VCS (GitLab, Bitbucket) in v1.
- No fine-tuned/custom model — uses Claude API as-is via a crafted system prompt.
- No per-line auto-fix / commit-back of suggested changes in v1 (comments only).

## 4. Users

- **Primary user**: the author, reviewing their own PRs across personal/portfolio repos.
- **Secondary (future)**: any developer who installs the GitHub App on their own repos — the design should not hardcode assumptions that only work for one person, even though v1 ships for personal use.

## 5. User Stories

1. As a repo owner, when I open or update a PR, I want an automated review comment to appear on the diff within a few minutes, flagging real bugs, security risks, and style issues.
2. As a repo owner, I want an email after the review completes summarizing severity counts and the top issues, so I don't have to open GitHub to know if something is wrong.
3. As a repo owner, if I push 3 PRs across 3 repos at once, I want all of them reviewed without one PR's review blocking or delaying another.
4. As a repo owner, if Claude or GitHub is briefly unavailable, I want the review to retry automatically rather than silently disappear.
5. As a repo owner, I want to add a new repo (e.g., InterviewOS) to be auto-reviewed just by installing the GitHub App on it — no code changes.

## 6. Functional Requirements

### 6.1 GitHub Integration
- Ship as a **GitHub App** (not per-repo webhooks) — single app, installed on the author's account, covering any selected repos. Supports adding/removing repos without redeploying.
- Subscribe to `pull_request` webhook events: `opened`, `reopened`, `synchronize` (covers new PRs and new commits pushed to an existing PR).
- Verify every incoming webhook using the GitHub App webhook secret (HMAC SHA-256 signature check) before processing.
- Use GitHub App installation tokens (short-lived, scoped to the installation) to call the GitHub API — never a personal access token.
- Required permissions: Pull requests (Read & write), Contents (Read-only), Metadata (Read-only).

### 6.2 Diff Retrieval & Review
- On a valid PR event, enqueue a job (not process inline) and return HTTP 200 immediately.
- Worker fetches the PR's changed files/diff via the GitHub API (`GET /repos/{owner}/{repo}/pulls/{pr}/files`), not by shelling out to git.
- Diff is chunked per-file; files beyond a configurable size/count threshold are summarized or skipped with a note (cost & token-limit guard), rather than failing the whole job.
- Idempotency: a job key of `{installationId}-{repo}-{prNumber}-{headSha}` prevents duplicate reviews if the same commit triggers multiple deliveries (GitHub redelivery, rapid force-push).

### 6.3 Claude API Review
- System prompt instructs Claude to act as a senior reviewer restricted to three categories only: **Bugs/Correctness**, **Security** (OWASP-style: injection, auth, secrets, unsafe deserialization, etc.), **Code Style/Convention** (project/language idioms, naming, dead code).
- Response format is constrained to structured JSON: a list of findings, each with `file`, `line` (or line range), `severity` (blocker/major/minor/nit), `category`, and `message`. No free-form prose praise, no restating the diff.
- Findings with no real signal (e.g., nothing wrong) should produce an explicit "no issues found" result rather than invented filler — prompt must discourage hallucinated findings.
- Model and max-tokens are configurable via env var so cost/quality can be tuned without code changes.

### 6.4 Posting Results
- **Inline PR comments**: findings are posted as a single GitHub PR Review (`POST /pulls/{pr}/reviews`) with per-finding `comments` anchored to file+line, plus one overall review body. Severity ≥ "major" sets review event to `REQUEST_CHANGES`-equivalent language in the body (but does not block merge — no branch protection requirement implied by v1).
- **Email summary**: one email per completed review, to a configured recipient address, containing: repo + PR title/link, severity counts (blocker/major/minor/nit), and the top N findings inline (not just a link). Sent via a transactional email provider (e.g., Resend) over SMTP-free HTTP API for reliability on Railway.
- If Claude returns zero findings, both the PR comment and email should clearly say "reviewed, no issues found" — not stay silent (silence is indistinguishable from failure).

### 6.5 Queueing & Concurrency
- Redis-backed job queue (BullMQ) decouples the webhook receiver (fast ack) from the worker (slow: GitHub API + Claude API calls).
- Worker concurrency is configurable (default: 3) so multiple PRs across repos process in parallel, bounded to respect Claude API rate limits.
- Failed jobs retry with exponential backoff (default: 3 attempts) for transient errors (Claude/GitHub 5xx, timeouts); permanent failures (bad payload, missing permissions) do not retry and are logged.

### 6.6 Self-hosting on own repos ("live proof")
- The GitHub App is installed on: `DiffHawk` (this repo), `DevPulse`, `InterviewOS`.
- This is a deployment/config step, not a special code path — the app must treat all installed repos identically.

## 7. Non-Functional Requirements

- **Latency**: webhook ack < 2s; end-to-end review (PR opened → comment posted) target < 5 minutes for a typical PR (<500 changed lines).
- **Reliability**: no review job silently lost — every enqueue either completes, retries, or lands in a dead-letter state with a log entry.
- **Cost control**: a single oversized PR must not blow up API spend — hard cap on tokens sent per review, with graceful partial-review fallback.
- **Security**: webhook secret, GitHub App private key, Anthropic API key, and email API key are stored only in Railway environment variables, never committed to the repo. Webhook signature verification is mandatory, not optional.
- **Observability**: structured logs per job (queued, started, completed, failed) sufficient to debug a missing review after the fact.

## 8. Architecture Overview (high level)

```
GitHub PR event
      |
      v
[Webhook receiver: Node.js/Express]  -- verifies signature, enqueues job, returns 200
      |
      v
[Redis queue: BullMQ]
      |
      v
[Worker process] -- fetch diff (Octokit) --> [Claude API] --> structured findings
      |                                                              |
      v                                                              v
[Post PR review comments (Octokit)]                      [Send summary email]
```

Deployed as a Node.js service on Railway, with Railway's managed Redis plugin for the queue.

## 9. Open Questions / Future Considerations

- Should there eventually be a minimal dashboard to see review history without digging through email/GitHub? (Out of scope v1.)
- Should severity ≥ blocker eventually wire into a GitHub Check Run / required status check to actually gate merges? (Deliberately deferred — v1 is advisory only.)
- Multi-tenant install (other users adding the app) would need per-installation email recipient configuration — current v1 assumes a single owner/recipient.

## 10. Success Criteria

- App is installed and actively reviewing PRs on DiffHawk, DevPulse, and InterviewOS.
- At least one real bug or security issue is caught by the bot during normal development of those repos (not a synthetic test) — this is the actual proof of value.
- No missed reviews due to concurrent PRs across repos (queue holds under simultaneous load).
