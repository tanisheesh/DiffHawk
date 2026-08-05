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
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
  maxDiffTokens: parseInt(process.env.MAX_DIFF_TOKENS ?? '30000', 10),

  nextAuthSecret: requireEnv('NEXTAUTH_SECRET'),
};
