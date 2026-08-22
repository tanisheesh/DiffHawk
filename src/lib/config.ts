export const requireEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const config = {
  githubAppId: (() => {
    const raw = requireEnv('GITHUB_APP_ID');
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`GITHUB_APP_ID must be a positive integer, got: ${raw}`);
    return n;
  })(),
  githubPrivateKey: requireEnv('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
  githubWebhookSecret: requireEnv('GITHUB_WEBHOOK_SECRET'),

  groqApiKey: requireEnv('GROQ_API_KEY'),
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  dailyReviewLimit: (() => {
    const raw = process.env.DAILY_REVIEW_LIMIT ?? '50';
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) throw new Error(`DAILY_REVIEW_LIMIT must be a non-negative integer (0 = no limit), got: ${raw}`);
    return n;
  })(),
  workerConcurrency: (() => {
    const n = parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`WORKER_CONCURRENCY must be a positive integer, got: ${process.env.WORKER_CONCURRENCY}`);
    return n;
  })(),
  maxDiffTokens: (() => {
    const n = parseInt(process.env.MAX_DIFF_TOKENS ?? '30000', 10);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`MAX_DIFF_TOKENS must be a positive integer, got: ${process.env.MAX_DIFF_TOKENS}`);
    return n;
  })(),

  nextAuthSecret: requireEnv('NEXTAUTH_SECRET'),
};
