import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ioredis', 'bullmq', 'nodemailer', '@octokit/rest', '@octokit/auth-app'],
};

export default nextConfig;
