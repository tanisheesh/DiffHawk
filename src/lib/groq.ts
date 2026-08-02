import Groq from 'groq-sdk';
import { config } from './config';
import type { PrFile, ReviewResult } from './github';

const client = new Groq({ apiKey: config.groqApiKey });

const SYSTEM_PROMPT = `You are a senior software engineer performing a code review. Review only the diff shown — do not make assumptions about code not in the diff.

Report findings in exactly three categories:
- bug: correctness issues — logic errors, off-by-one, null/undefined handling, race conditions, incorrect API usage
- security: OWASP-class issues — injection, broken auth, hardcoded secrets, unsafe deserialization, SSRF, path traversal, missing input validation at trust boundaries
- style: naming, dead code, inconsistent conventions relative to the diff, missing error handling for cases that *can* happen

Rules:
1. Only report findings you are confident about from the diff. Do not invent issues to appear thorough.
2. If nothing to report, return an empty findings array — no praise, no filler.
3. Output ONLY the JSON object below — no prose before or after, no markdown fences.

Required output format:
{
  "summary": "one-line verdict, e.g. 'No issues found.' or '1 security issue, 2 bugs.'",
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "blocker" | "major" | "minor" | "nit",
      "category": "bug" | "security" | "style",
      "message": "Concise description of the issue."
    }
  ]
}`;

export async function reviewDiff(
  files: PrFile[],
  skippedFiles: string[],
  context: { owner: string; repo: string; prNumber: number; prTitle: string }
): Promise<ReviewResult> {
  const { owner, repo, prNumber, prTitle } = context;

  let userMessage = `Review this pull request:\n\nRepo: ${owner}/${repo}\nPR #${prNumber}: ${prTitle}\n\nChanged files:\n\n`;

  for (const file of files) {
    userMessage += `--- file: ${file.filename} ---\n${file.patch}\n\n`;
  }

  if (skippedFiles.length > 0) {
    userMessage += `\nNote: ${skippedFiles.length} file(s) were skipped (over token budget): ${skippedFiles.join(', ')}`;
  }

  if (files.length === 0) {
    return { summary: 'No reviewable files in this PR (all binary or generated).', findings: [] };
  }

  const response = await client.chat.completions.create({
    model: config.groqModel,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  return parseResponse(text);
}

function parseResponse(text: string): ReviewResult {
  let jsonText = text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonText);

  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.findings)) {
    throw new Error('Invalid response schema from Groq');
  }

  return {
    summary: parsed.summary,
    findings: parsed.findings.map((f: Record<string, unknown>) => ({
      file: String(f.file ?? ''),
      line: Number(f.line ?? 0),
      severity: f.severity as ReviewResult['findings'][number]['severity'],
      category: f.category as ReviewResult['findings'][number]['category'],
      message: String(f.message ?? ''),
    })),
  };
}
