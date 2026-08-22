import { Job, UnrecoverableError } from 'bullmq';
import { getInstallationOctokit, fetchDiff, postReview } from '../src/lib/github.js';
import { reviewDiff, GroqFormatError } from '../src/lib/groq.js';
import { sendSummaryEmail } from '../src/lib/email.js';

export async function processReview(job: Job) {
  const { installationId, owner, repo, prNumber, headSha, prTitle, prUrl } = job.data;

  console.log(JSON.stringify({ event: 'job.started', jobId: job.id, owner, repo, prNumber }));

  try {
    const octokit = await getInstallationOctokit(installationId);
    const { files, skippedFiles } = await fetchDiff(octokit, owner, repo, prNumber);
    const result = await reviewDiff(files, skippedFiles, { owner, repo, prNumber, prTitle });

    await postReview(octokit, owner, repo, prNumber, headSha, result, files, skippedFiles);

    // Email is a side-channel notification — failure must not invalidate an already-posted review
    // or trigger retries that would duplicate the GitHub review comment.
    try {
      await sendSummaryEmail({ owner, repo, prNumber, prTitle, prUrl, result });
    } catch (emailErr) {
      console.error(JSON.stringify({
        event: 'email.failed',
        jobId: job.id,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      }));
    }

    return result;
  } catch (err: unknown) {
    if (err instanceof GroqFormatError) {
      throw new UnrecoverableError(err.message);
    }
    const httpStatus = (err as { status?: number })?.status;
    const errMessage = err instanceof Error ? err.message : String(err);
    // Secondary rate limits (403) are retriable — only hard-fail on auth/not-found/validation errors
    const isSecondaryRateLimit = errMessage.includes('secondary rate limit');
    if (!isSecondaryRateLimit && (httpStatus === 401 || httpStatus === 404 || httpStatus === 422)) {
      throw new UnrecoverableError(errMessage);
    }
    if (httpStatus === 403 && !isSecondaryRateLimit) {
      throw new UnrecoverableError(errMessage);
    }
    throw err;
  }
}
