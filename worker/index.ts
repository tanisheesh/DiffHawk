import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../src/lib/config.js';
import { processReview } from './review.js';

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

connection.on('error', (err) => {
  console.error(JSON.stringify({ event: 'redis.error', error: err.message }));
});

const worker = new Worker('pr-review', processReview, {
  connection,
  concurrency: config.workerConcurrency,
});

worker.on('completed', (job) => {
  const findings = job.returnvalue?.findings?.length ?? 0;
  console.log(JSON.stringify({ event: 'job.completed', jobId: job.id, findings }));
});

worker.on('failed', (job, err) => {
  console.error(JSON.stringify({ event: 'job.failed', jobId: job?.id, error: err.message }));
});

async function shutdown() {
  console.log(JSON.stringify({ event: 'worker.shutdown' }));
  await worker.close();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(JSON.stringify({ event: 'worker.started', concurrency: config.workerConcurrency }));
