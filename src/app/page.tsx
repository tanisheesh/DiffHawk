'use client';

import { useEffect, useState } from 'react';

interface Finding {
  file: string;
  line: number;
  severity: 'blocker' | 'major' | 'minor' | 'nit';
  category: 'bug' | 'security' | 'style';
  message: string;
}

interface ReviewResult {
  summary: string;
  findings: Finding[];
}

interface Job {
  id: string;
  status: 'completed' | 'failed' | 'active' | 'waiting';
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  result: ReviewResult | null;
  failedReason: string | null;
  timestamp: number | null;
}

const SEVERITY_STYLE: Record<Finding['severity'], string> = {
  blocker: 'bg-red-500 text-white',
  major:   'bg-orange-500 text-white',
  minor:   'bg-yellow-500 text-black',
  nit:     'bg-zinc-600 text-zinc-200',
};

const STATUS_STYLE: Record<Job['status'], string> = {
  completed: 'text-emerald-400 bg-emerald-400/10',
  failed:    'text-red-400 bg-red-400/10',
  active:    'text-blue-400 bg-blue-400/10',
  waiting:   'text-zinc-400 bg-zinc-700/40',
};

const STATUS_LABEL: Record<Job['status'], string> = {
  completed: 'Completed',
  failed:    'Failed',
  active:    'Running',
  waiting:   'Queued',
};

function countSeverities(findings: Finding[]) {
  const c = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const findings = job.result?.findings ?? [];
  const counts = countSeverities(findings);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl max-h-[82vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-zinc-800 gap-4">
          <div>
            <a href={job.prUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-400 hover:underline">
              {job.owner}/{job.repo} #{job.prNumber}
            </a>
            <p className="text-sm text-zinc-300 mt-1">{job.prTitle}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 text-2xl leading-none mt-0.5">×</button>
        </div>

        <div className="p-6 space-y-6">
          {job.result && (
            <>
              <div className="rounded-lg bg-zinc-800 px-4 py-3 text-sm text-zinc-200 italic">
                {job.result.summary}
              </div>

              <div className="grid grid-cols-4 gap-3 text-center">
                {(['blocker', 'major', 'minor', 'nit'] as const).map((s) => (
                  <div key={s} className="rounded-lg bg-zinc-800 p-3">
                    <p className="text-2xl font-bold tabular-nums">{counts[s]}</p>
                    <p className="text-xs text-zinc-400 mt-1 capitalize">{s}</p>
                  </div>
                ))}
              </div>

              {findings.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Findings</h3>
                  {findings.map((f, i) => (
                    <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
                        <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">{f.category}</span>
                        <code className="text-xs text-zinc-400 ml-auto">{f.file}:{f.line}</code>
                      </div>
                      <p className="text-sm text-zinc-200">{f.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {findings.length === 0 && (
                <div className="text-center py-4 text-emerald-400 text-sm">✓ No issues found — clean PR</div>
              )}
            </>
          )}

          {job.status === 'failed' && (
            <div className="rounded-lg bg-red-950 border border-red-800 p-4 text-sm text-red-300">
              <p className="font-semibold mb-1">Job failed</p>
              <p className="font-mono text-xs break-all">{job.failedReason}</p>
            </div>
          )}

          {(job.status === 'active' || job.status === 'waiting') && (
            <div className="flex items-center gap-3 text-sm text-indigo-300">
              <Spinner />
              Review in progress…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Job | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function fetchJobs() {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 15_000);
    return () => clearInterval(id);
  }, []);

  const completed = jobs.filter((j) => j.status === 'completed');
  const allFindings = completed.flatMap((j) => j.result?.findings ?? []);
  const inProgress = jobs.filter((j) => j.status === 'active' || j.status === 'waiting').length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {lastRefresh
              ? `Last updated ${timeAgo(lastRefresh.getTime())} · auto-refreshes every 15s`
              : 'Loading…'}
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="PRs Reviewed" value={completed.length} />
        <StatCard label="Total Findings" value={allFindings.length} />
        <StatCard label="Blockers" value={allFindings.filter((f) => f.severity === 'blocker').length} />
        <StatCard label="Security Issues" value={allFindings.filter((f) => f.category === 'security').length} />
      </div>

      {inProgress > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-300">
          <Spinner />
          {inProgress} review{inProgress > 1 ? 's' : ''} in progress…
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300">Recent Reviews</h2>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-3 text-zinc-500 text-sm">
            <Spinner /> Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            No reviews yet. Open a PR on an installed repo to trigger the first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-2.5 text-left font-medium">Pull Request</th>
                  <th className="px-5 py-2.5 text-left font-medium">Status</th>
                  <th className="px-5 py-2.5 text-left font-medium">Findings</th>
                  <th className="px-5 py-2.5 text-left font-medium whitespace-nowrap">Time</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const findings = job.result?.findings ?? [];
                  const counts = countSeverities(findings);
                  return (
                    <tr
                      key={job.id}
                      className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40 cursor-pointer transition-colors"
                      onClick={() => setSelected(job)}
                    >
                      <td className="px-5 py-3">
                        <a
                          href={job.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-indigo-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {job.repo} #{job.prNumber}
                        </a>
                        <p className="text-xs text-zinc-400 mt-0.5 max-w-[260px] truncate">{job.prTitle}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[job.status]}`}>
                          {STATUS_LABEL[job.status]}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {job.status === 'completed' && (
                          <div className="flex flex-wrap gap-1.5">
                            {counts.blocker > 0 && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">{counts.blocker}B</span>}
                            {counts.major > 0   && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">{counts.major}M</span>}
                            {counts.minor > 0   && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">{counts.minor}m</span>}
                            {counts.nit > 0     && <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded">{counts.nit}n</span>}
                            {findings.length === 0 && <span className="text-xs text-emerald-400">✓ Clean</span>}
                          </div>
                        )}
                        {job.status === 'failed' && (
                          <span className="text-xs text-red-400 max-w-[180px] truncate block">{job.failedReason}</span>
                        )}
                        {(job.status === 'active' || job.status === 'waiting') && (
                          <span className="flex items-center gap-1.5 text-xs text-zinc-400"><Spinner /> In progress</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">{timeAgo(job.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <JobDetail job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
