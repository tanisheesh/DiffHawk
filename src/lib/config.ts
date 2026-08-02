const requireEnv = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const config = {
  githubAppId: Number(requireEnv('GITHUB_APP_ID')),
  githubPrivateKey: requireEnv('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
  githubWebhookSecret: requireEnv('GITHUB_WEBHOOK_SECRET'),

  groqApiKey: requireEnv('GROQ_API_KEY'),
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',

  smtpHost: requireEnv('EMAIL_SMTP_HOST'),
  smtpPort: parseInt(process.env.EMAIL_SMTP_PORT ?? '587', 10),
  smtpUser: requireEnv('EMAIL_SMTP_USER'),
  smtpPass: requireEnv('EMAIL_SMTP_PASS'),
  emailFrom: requireEnv('EMAIL_FROM'),
  emailTo: requireEnv('EMAIL_TO'),

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10),
  maxDiffTokens: parseInt(process.env.MAX_DIFF_TOKENS ?? '30000', 10),
};
