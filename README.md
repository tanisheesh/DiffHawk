<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#0A0A0A"/>
    <path d="M16 7C7.5 7 2 16 2 16s5.5 9 14 9 14-9 14-9-5.5-9-14-9z" fill="#F5C200"/>
    <circle cx="16" cy="16" r="5.5" fill="#1A0800"/>
    <path d="M14.9 11.2c.5-.3 1.7-.3 2.2 0s1.4 2.5 1.4 4.8-1 4.5-1.4 4.8-1.7.3-2.2 0-1.4-2.5-1.4-4.8 1-4.5 1.4-4.8z" fill="#080808"/>
    <ellipse cx="13.2" cy="13.2" rx="1.3" ry="0.9" fill="white" opacity="0.88" transform="rotate(-15 13.2 13.2)"/>
  </svg>
</p>

<h1 align="center">DiffHawk</h1>

<p align="center">
  <strong>Automated GitHub PR code reviewer — inline diff comments, severity ranking, and email summaries in under 30 seconds.</strong>
</p>

<p align="center">
  <a href="https://diffhawk.up.railway.app">
    <img src="https://img.shields.io/badge/live_demo-F5C200-F5C200?style=flat-square" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/Next.js-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Groq-F55036?style=flat-square" alt="Groq">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" alt="Railway">
  <img src="https://img.shields.io/badge/license-GPL--3.0-F5C200?style=flat-square" alt="License">
</p>

---

## What is DiffHawk?

DiffHawk is a GitHub App that automatically reviews every pull request on your repos — no manual triggering, no configuration per repo. The moment a PR is opened or updated, DiffHawk receives the webhook, fetches the diff, sends it to Groq's Llama 3.3-70B model with a tightly scoped system prompt, and posts inline review comments anchored to exact diff lines alongside a severity-ranked summary email — all within about 30 seconds. It's installed on its own development repos (DiffHawk, DevPulse, InterviewOS), so every PR made while building those projects is reviewed live — proof that ships with the product, not a staged demo.

> **Live demo →** [diffhawk.up.railway.app](https://diffhawk.up.railway.app)

---

## What you get

- **Inline diff comments** — Findings are posted as a single GitHub PR Review with comments anchored to the exact file and line, not just a summary in the description.
- **Severity ranking** — Every issue is classified as Blocker, Major, Minor, or Nit across three categories (Security, Bug, Style), so you know what to fix before merging.
- **Email summary** — A formatted HTML email with severity counts and top findings arrives the moment the review completes — no need to open GitHub to know if something is wrong.
- **Concurrent review queue** — BullMQ + Redis decouples webhook ack (< 2s) from the actual review (30–90s), so simultaneous PRs across multiple repos process in parallel without blocking each other.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Auth | NextAuth v4 · GitHub OAuth |
| Queue | BullMQ 6 · IORedis · Redis |
| AI | Groq SDK · Llama 3.3-70B Versatile |
| GitHub | @octokit/rest · @octokit/auth-app (App installation tokens) |
| Email | Nodemailer · Gmail SMTP |
| Styling | Tailwind CSS 4 · Barlow / Barlow Condensed |
| Hosting | Railway (Web service + Worker service + Redis plugin) |

---

## Engineering Decisions

**Why Groq over Claude or GPT-4?**
Groq's LPU hardware delivers inference in under 2 seconds for typical PR diffs, keeping end-to-end review time well under 30 seconds. Claude and GPT-4 can take 15–30s+ for large prompts — fast enough for batch jobs, but slow when developers are waiting at their terminal.

**Why BullMQ + Redis over processing the review inline in the webhook handler?**
GitHub requires webhook acknowledgement within 10 seconds or it marks the delivery failed and retries — which would post duplicate reviews. A full review cycle (diff fetch + LLM call + GitHub API write) takes 30–90s, so it must happen out-of-band. BullMQ also gives free retry with exponential backoff and a structured dead-letter queue at no extra code cost.

**Why GitHub App installation tokens over a personal access token?**
Installation tokens are scoped to exactly the permissions declared on the app (Pull requests R/W + Contents R), are short-lived (1-hour expiry), and are minted fresh per job — so a leaked token from a single job cannot be replayed after expiry. A PAT would have broad account access, never expire by default, and require manual rotation.

**Why a per-installation daily cap stored in Redis INCR rather than no rate limiting?**
A misconfigured installation or a repo flooded with bot PRs could exhaust Groq API credits in minutes. Redis INCR with a 25-hour TTL provides a cheap O(1) sliding cap per installation. The implementation fails open — if Redis is unreachable, reviews proceed rather than being silently dropped.

**What would you do differently in v2?**
The current retry logic will repost a duplicate GitHub review if the review post succeeded but the email step threw (the job retries the whole pipeline). A compensation step or a "posted" flag persisted in Redis would fix this. I'd also replace the ephemeral Redis job history with a lightweight Postgres store (Neon serverless) so the dashboard survives a Redis restart.

---

## Docs

| Document | Description |
|---|---|
| [PRD](docs/PRD.md) | Product requirements — goals, user stories, non-goals |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, component breakdown |
| [Decisions](docs/DECISIONS.md) | Every major technical decision and why |
| [Setup](docs/SETUP.md) | Local dev setup, env vars, Railway deployment |

---

## Author

**Tanish Poddar** — [tanisheesh.in](https://tanisheesh.in) · [LinkedIn](https://linkedin.com/in/tanisheesh) · [GitHub](https://github.com/tanisheesh)
