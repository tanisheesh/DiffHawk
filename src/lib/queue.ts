import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const reviewQueue = new Queue('pr-review', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
