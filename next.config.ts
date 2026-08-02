import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ioredis', 'bullmq', 'nodemailer'],
};

export default nextConfig;
