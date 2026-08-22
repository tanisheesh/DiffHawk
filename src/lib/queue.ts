import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';

let _connection: IORedis | null = null;
let _reviewQueue: Queue | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  }
  return _connection;
}

export function getReviewQueue(): Queue {
  if (!_reviewQueue) {
    _reviewQueue = new Queue('pr-review', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _reviewQueue;
}
