import { App } from '@octokit/app';
import { config } from './config';

const app = new App({
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
});

// Cast to any: @octokit/app's generic doesn't surface rest/paginate plugin types
// but they are present at runtime via the bundled plugins.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getInstallationOctokit(installationId: number): Promise<any> {
  return app.getInstallationOctokit(installationId);
}

const SKIP_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|pdf|zip)$/i,
  /^(dist|build|\.next|out)\//,
];

function shouldSkip(filename: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(filename));
}

function parseChangedLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (m) {
      newLine = parseInt(m[1], 10) - 1;
    } else if (line.startsWith('+')) {
      lines.add(++newLine);
    } else if (!line.startsWith('-')) {
      newLine++;
    }
  }
  return lines;
}

export interface PrFile {
  filename: string;
  patch: string;
  changedLines: Set<number>;
}

export interface Finding {
  file: string;
  line: number;
  severity: 'blocker' | 'major' | 'minor' | 'nit';
  category: 'bug' | 'security' | 'style';
  message: string;
}

export interface ReviewResult {
  summary: string;
  findings: Finding[];
}

export async function fetchDiff(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ files: PrFile[]; skippedFiles: string[] }> {
  const allFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const files: PrFile[] = [];
  const skippedFiles: string[] = [];
  let estimatedTokens = 0;
  const budget = config.maxDiffTokens;

  for (const file of allFiles) {
    if (!file.patch || shouldSkip(file.filename)) continue;

    const chunkTokens = Math.ceil(file.patch.length / 4);
    if (estimatedTokens + chunkTokens > budget) {
      skippedFiles.push(file.filename);
    } else {
      files.push({ filename: file.filename, patch: file.patch, changedLines: parseChangedLines(file.patch) });
      estimatedTokens += chunkTokens;
    }
  }

  return { files, skippedFiles };
}

function severityLabel(s: Finding['severity']): string {
  return { blocker: '🔴 blocker', major: '🟠 major', minor: '🟡 minor', nit: '⚪ nit' }[s];
}

export async function postReview(
  octokit: any,
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  result: ReviewResult,
  files: PrFile[],
  skippedFiles: string[]
): Promise<void> {
  const changedLinesMap = new Map(files.map((f) => [f.filename, f.changedLines]));

  const inlineComments: { path: string; line: number; side: string; body: string }[] = [];
  const bodyOnlyFindings: Finding[] = [];

  for (const finding of result.findings) {
    const changedLines = changedLinesMap.get(finding.file);
    if (changedLines?.has(finding.line)) {
      inlineComments.push({
        path: finding.file,
        line: finding.line,
        side: 'RIGHT',
        body: `**[${severityLabel(finding.severity)} / ${finding.category}]** ${finding.message}`,
      });
    } else {
      bodyOnlyFindings.push(finding);
    }
  }

  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of result.findings) counts[f.severity]++;

  const hasBlockers = counts.blocker > 0 || counts.major > 0;

  let body = `## DiffHawk\n\n**${result.summary}**\n\n`;
  body += `| Severity | Count |\n|---|---|\n`;
  body += `| 🔴 Blocker | ${counts.blocker} |\n`;
  body += `| 🟠 Major   | ${counts.major} |\n`;
  body += `| 🟡 Minor   | ${counts.minor} |\n`;
  body += `| ⚪ Nit     | ${counts.nit} |\n`;

  if (hasBlockers) {
    body += `\n> ⚠️ This PR has issues requiring attention before merge.\n`;
  } else if (result.findings.length === 0) {
    body += `\n> ✅ Looks clean — no issues detected.\n`;
  }

  if (bodyOnlyFindings.length > 0) {
    body += `\n### Additional findings\n`;
    for (const f of bodyOnlyFindings) {
      body += `- **[${severityLabel(f.severity)}/${f.category}]** \`${f.file}:${f.line}\` — ${f.message}\n`;
    }
  }

  if (skippedFiles.length > 0) {
    body += `\n### Skipped (over token budget)\n`;
    body += skippedFiles.map((f) => `- \`${f}\``).join('\n');
  }

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: headSha,
    body,
    event: 'COMMENT',
    comments: inlineComments,
  });
}
