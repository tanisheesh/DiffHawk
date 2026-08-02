# DiffHawk

An automated PR review bot: installs as a GitHub App, triggers on every pull request, sends the diff to Groq (Llama) with a system prompt scoped to bugs/security/style, posts inline review comments back on the PR, and emails a formatted summary. A Redis-backed queue (BullMQ) lets multiple PRs across multiple repos process concurrently without blocking the webhook receiver. Next.js frontend + Node.js worker, deployed on Railway.

The bot is installed on its own author's repos — `DiffHawk`, `DevPulse`, `InterviewOS` — so every PR made while building those projects gets auto-reviewed live, as running proof the tool works rather than a staged demo.

## Docs

- [PRD](./docs/PRD.md) — goals, scope, requirements, success criteria.
- [Architecture](./docs/ARCHITECTURE.md) — component design, data flow, Claude prompt/response contract, env vars.
- [Setup](./docs/SETUP.md) — creating the GitHub App, Railway deployment, email provider, local dev.

## Stack

Next.js · Groq (Llama) · BullMQ · Redis · Nodemailer · Octokit · Railway
