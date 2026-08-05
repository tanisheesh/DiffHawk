import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Job } from 'bullmq';
import { reviewQueue } from '@/lib/queue';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface JobData {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
}

function format(job: Job<JobData>, status: string) {
  return {
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
  };
}

const ALLOWED_LOGINS = (process.env.ALLOWED_GITHUB_LOGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (ALLOWED_LOGINS.length > 0) {
    const login = (session.user as { login?: string }).login ?? '';
    if (!ALLOWED_LOGINS.includes(login)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [completed, failed, active, waiting] = await Promise.all([
    reviewQueue.getJobs(['completed'], 0, 30),
    reviewQueue.getJobs(['failed'], 0, 10),
    reviewQueue.getJobs(['active'], 0, 5),
    reviewQueue.getJobs(['waiting'], 0, 5),
  ]);

  const jobs = [
    ...active.map((j) => format(j as Job<JobData>, 'active')),
    ...waiting.map((j) => format(j as Job<JobData>, 'waiting')),
    ...completed.map((j) => format(j as Job<JobData>, 'completed')),
    ...failed.map((j) => format(j as Job<JobData>, 'failed')),
  ].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  return NextResponse.json({ jobs });
}
