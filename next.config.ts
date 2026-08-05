import type { NextConfig } from 'next';

// CSP is set per-request with a cryptographic nonce in src/proxy.ts (middleware).
// Static headers only — no CSP here to avoid caching a static nonce.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ioredis', 'bullmq', 'nodemailer', '@octokit/rest', '@octokit/auth-app'],
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
