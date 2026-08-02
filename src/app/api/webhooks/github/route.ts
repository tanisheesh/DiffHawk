import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { reviewQueue } from '@/lib/queue';
import { config } from '@/lib/config';

const RELEVANT_ACTIONS = new Set(['opened', 'reopened', 'synchronize']);

function verifySignature(rawBody: string, signature: string): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', config.githubWebhookSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const event = req.headers.get('x-github-event');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (event !== 'pull_request') {
    return NextResponse.json({ message: 'Ignored' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!RELEVANT_ACTIONS.has(payload.action as string)) {
    return NextResponse.json({ message: 'Ignored' });
  }

  const { installation, repository, pull_request: pr } = payload as any;

  if (!installation || !repository || !pr) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const jobId = `${installation.id}-${repository.full_name}-${pr.number}-${pr.head.sha}`;

  await reviewQueue.add(
    'review',
    {
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      prNumber: pr.number,
      headSha: pr.head.sha,
      prTitle: pr.title,
      prUrl: pr.html_url,
    },
    { jobId }
  );

  console.log(JSON.stringify({ event: 'job.enqueued', jobId, repo: repository.full_name, pr: pr.number }));
  return NextResponse.json({ message: 'Accepted' });
}
