import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { connection } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const queue = new Queue('pr-review', { connection });

  const [completed, failed, active, waiting] = await Promise.all([
    queue.getJobs(['completed'], 0, 30),
    queue.getJobs(['failed'], 0, 10),
    queue.getJobs(['active'], 0, 5),
    queue.getJobs(['waiting'], 0, 5),
  ]);

  const format = (job: any, status: string) => ({
    id: job.id,
    status,
    owner: job.data.owner,
    repo: job.data.repo,
    prNumber: job.data.prNumber,
    prTitle: job.data.prTitle,
    prUrl: job.data.prUrl,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
    timestamp: job.finishedOn ?? job.processedOn ?? job.timestamp ?? null,
  });

  const jobs = [
    ...active.map((j) => format(j, 'active')),
    ...waiting.map((j) => format(j, 'waiting')),
    ...completed.map((j) => format(j, 'completed')),
    ...failed.map((j) => format(j, 'failed')),
  ].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  return NextResponse.json({ jobs });
}
