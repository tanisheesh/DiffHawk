import IORedis from 'ioredis';
import { config } from './config';

let _redis: IORedis | null = null;

function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
    _redis.on('error', () => { /* caller catches */ });
  }
  return _redis;
}

/**
 * Returns { allowed: true } when the installation is within its daily review cap.
 * Fails open: if Redis is unavailable, allowed = true so reviews still proceed.
 * Set DAILY_REVIEW_LIMIT=0 to disable the cap entirely.
 */
export async function checkInstallationRateLimit(
  installationId: number
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = config.dailyReviewLimit;
  if (limit === 0) return { allowed: true, remaining: Infinity };

  const date = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const key = `ratelimit:${installationId}:${date}`;

  const redis = getRedis();
  const results = await redis.pipeline().incr(key).expire(key, 90_000).exec();
  const count = (results?.[0]?.[1] as number) ?? 1;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
