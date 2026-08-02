import { Job, UnrecoverableError } from 'bullmq';
import { getInstallationOctokit, fetchDiff, postReview } from '../src/lib/github.js';
import { reviewDiff } from '../src/lib/groq.js';
import { sendSummaryEmail } from '../src/lib/email.js';

export async function processReview(job: Job) {
  const { installationId, owner, repo, prNumber, headSha, prTitle, prUrl } = job.data;

  console.log(JSON.stringify({ event: 'job.started', jobId: job.id, owner, repo, prNumber }));

  try {
    const octokit = await getInstallationOctokit(installationId);
    const { files, skippedFiles } = await fetchDiff(octokit, owner, repo, prNumber);
    const result = await reviewDiff(files, skippedFiles, { owner, repo, prNumber, prTitle });

    await postReview(octokit, owner, repo, prNumber, headSha, result, files, skippedFiles);
    await sendSummaryEmail({ owner, repo, prNumber, prTitle, prUrl, result });

    return result;
  } catch (err: any) {
    if (err?.status === 403 || err?.status === 404 || err?.status === 422) {
      throw new UnrecoverableError(err.message);
    }
    throw err;
  }
}
