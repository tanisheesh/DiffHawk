import nodemailer from 'nodemailer';
import type { ReviewResult, Finding } from './github';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTransporter() {
  const host = process.env.EMAIL_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.EMAIL_SMTP_PORT ?? '587', 10),
    secure: process.env.EMAIL_SMTP_PORT === '465',
    auth: {
      user: process.env.EMAIL_SMTP_USER ?? '',
      pass: process.env.EMAIL_SMTP_PASS ?? '',
    },
  });
}

export async function sendSummaryEmail(opts: {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  result: ReviewResult;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(JSON.stringify({ event: 'email.skipped', reason: 'SMTP not configured' }));
    return;
  }

  const { repo, prNumber, prTitle, prUrl, result } = opts;

  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of result.findings) counts[f.severity]++;

  const verdict =
    result.findings.length === 0 ? 'Clean'
    : counts.blocker > 0 ? 'Blockers Found'
    : counts.major > 0 ? 'Issues Found'
    : 'Minor Issues';

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `[DiffHawk] ${repo} PR #${prNumber}: ${verdict}`,
    html: buildHtml({ prNumber, prTitle, prUrl, result, counts }),
  });
}

function severityColor(s: Finding['severity']): string {
  return { blocker: '#ef4444', major: '#f97316', minor: '#eab308', nit: '#a1a1aa' }[s];
}

function buildHtml(opts: {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  result: ReviewResult;
  counts: Record<string, number>;
}): string {
  const { prNumber, prTitle, prUrl, result, counts } = opts;

  const safeTitle = escapeHtml(prTitle);
  const safeUrl = escapeHtml(prUrl);

  const topFindings = result.findings
    .filter((f) => f.severity === 'blocker' || f.severity === 'major')
    .slice(0, 5);

  const statusIcon = result.findings.length === 0 ? '✅' : counts.blocker > 0 ? '🔴' : '🟠';

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b;">
  <div style="border-bottom:3px solid #6366f1;padding-bottom:12px;margin-bottom:24px;">
    <span style="font-size:20px;font-weight:700;">🤖 DiffHawk</span>
  </div>

  <p style="margin:0 0 4px;"><strong>PR #${prNumber}: ${safeTitle}</strong></p>
  <p style="margin:0 0 20px;"><a href="${safeUrl}" style="color:#6366f1;">${safeUrl}</a></p>

  <div style="background:#f4f4f5;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
    ${statusIcon} ${escapeHtml(result.summary)}
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <thead>
      <tr style="background:#f4f4f5;">
        <th style="padding:8px 12px;text-align:left;font-weight:600;">Severity</th>
        <th style="padding:8px 12px;text-align:right;font-weight:600;">Count</th>
      </tr>
    </thead>
    <tbody>
      ${[['🔴 Blocker', counts.blocker], ['🟠 Major', counts.major], ['🟡 Minor', counts.minor], ['⚪ Nit', counts.nit]]
        .map(([label, count]) => `<tr style="border-top:1px solid #e4e4e7;">
          <td style="padding:8px 12px;">${label}</td>
          <td style="padding:8px 12px;text-align:right;">${count}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  ${topFindings.length > 0 ? `
  <h3 style="margin:0 0 12px;font-size:15px;">Top Issues</h3>
  ${topFindings.map((f) => `
  <div style="border-left:3px solid ${severityColor(f.severity)};padding:8px 12px;margin-bottom:8px;background:#fafafa;border-radius:0 4px 4px 0;">
    <code style="font-size:12px;color:#71717a;">${escapeHtml(f.file)}:${f.line}</code>
    <span style="display:inline-block;background:${severityColor(f.severity)};color:#fff;font-size:11px;padding:1px 6px;border-radius:4px;margin-left:6px;">${escapeHtml(f.severity)}</span>
    <span style="display:inline-block;background:#e4e4e7;color:#3f3f46;font-size:11px;padding:1px 6px;border-radius:4px;margin-left:4px;">${escapeHtml(f.category)}</span>
    <p style="margin:6px 0 0;">${escapeHtml(f.message)}</p>
  </div>`).join('')}` : ''}

  <a href="${safeUrl}" style="display:inline-block;margin-top:20px;background:#6366f1;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;">View PR on GitHub →</a>

  <p style="color:#a1a1aa;font-size:12px;margin-top:32px;border-top:1px solid #e4e4e7;padding-top:16px;">
    Automated review by DiffHawk · Powered by Groq + Llama
  </p>
</body>
</html>`;
}
