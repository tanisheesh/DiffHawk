'use client';
import { useEffect, useState, useCallback, Fragment } from 'react';

interface Finding {
  file: string;
  line: number;
  severity: 'blocker' | 'major' | 'minor' | 'nit';
  category: 'bug' | 'security' | 'style';
  message: string;
}

interface Job {
  id: string;
  status: 'active' | 'waiting' | 'completed' | 'failed';
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  result: { summary: string; findings: Finding[] } | null;
  failedReason: string | null;
  timestamp: number | null;
}

const SEV_ORDER: Record<Finding['severity'], number> = { blocker: 0, major: 1, minor: 2, nit: 3 };
const SEV_COLOR: Record<Finding['severity'], string> = {
  blocker: 'var(--color-danger)',
  major: 'var(--color-warn)',
  minor: '#D97706',
  nit: 'var(--color-muted)',
};

function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SevPill({ sev, count }: { sev: Finding['severity']; count: number }) {
  if (!count) return null;
  const labels: Record<Finding['severity'], string> = { blocker: 'B', major: 'M', minor: 'm', nit: 'n' };
  return (
    <span
      className={`badge badge-${sev}`}
      title={sev}
    >
      {labels[sev]}·{count}
    </span>
  );
}

function StatusBadge({ status }: { status: Job['status'] }) {
  const map: Record<Job['status'], string> = {
    completed: 'badge-done',
    failed: 'badge-failed',
    active: 'badge-active',
    waiting: 'badge-waiting',
  };
  const labels: Record<Job['status'], string> = {
    completed: 'DONE',
    failed: 'FAILED',
    active: 'RUNNING',
    waiting: 'QUEUED',
  };
  return <span className={`badge ${map[status]}`}>{labels[status]}</span>;
}

function FindingsPanel({ findings }: { findings: Finding[] }) {
  if (!findings.length) {
    return (
      <div style={{ padding: '20px 24px', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
        No findings — clean PR.
      </div>
    );
  }

  const sorted = [...findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {sorted.map((f) => (
        <div
          key={`${f.file}:${f.line}:${f.severity}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto auto 1fr',
            gap: '12px',
            alignItems: 'baseline',
            padding: '10px 12px',
            background: 'var(--color-surface)',
            borderLeft: `4px solid ${SEV_COLOR[f.severity]}`,
            border: '1px solid var(--color-border)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: SEV_COLOR[f.severity],
              fontWeight: 700,
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
            }}
          >
            {f.severity}
          </span>
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {f.file}:{f.line}
          </code>
          <span style={{ fontSize: '13px', lineHeight: 1.5 }}>{f.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFetchError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setFetchError(null);
      setLastRefresh(new Date());
    } catch {
      setFetchError('Network error — retrying…');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 15_000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  // deduplicate by job id (prefer completed over waiting)
  const deduped = Object.values(
    jobs.reduce<Record<string, Job>>((acc, job) => {
      const existing = acc[job.id];
      if (!existing || job.status === 'completed' || job.status === 'active') {
        acc[job.id] = job;
      }
      return acc;
    }, {})
  );

  const completed = deduped.filter((j) => j.status === 'completed');
  const totalFindings = completed.reduce((s, j) => s + (j.result?.findings?.length ?? 0), 0);
  const totalBlockers = completed.reduce((s, j) => s + (j.result?.findings?.filter((f) => f.severity === 'blocker').length ?? 0), 0);
  const totalSecurity = completed.reduce((s, j) => s + (j.result?.findings?.filter((f) => f.category === 'security').length ?? 0), 0);

  const stats = [
    { value: completed.length, label: 'PRs Reviewed', accentColor: 'var(--color-hawk)' },
    { value: totalFindings, label: 'Total Findings', accentColor: 'var(--color-ink)' },
    { value: totalBlockers, label: 'Blockers', accentColor: 'var(--color-danger)' },
    { value: totalSecurity, label: 'Security Issues', accentColor: 'var(--color-warn)' },
  ];

  return (
    <div>
      {/* ── Stats ─────────────────────────────────── */}
      <section className="dash-section" style={{ borderBottom: '3px solid var(--color-border)' }}>
        <div className="dash-stats-grid">
          {stats.map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-accent" style={{ background: s.accentColor }} />
              <div className="stat-value">{loading ? '—' : s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Jobs table ──────────────────────────────── */}
      <section className="dash-section">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '20px',
            gap: '12px',
          }}
        >
          <p className="section-label">Recent reviews</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lastRefresh && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-muted)' }}>
                Updated {timeAgo(lastRefresh.getTime())}
              </span>
            )}
            <button className="btn btn-sm" onClick={fetchJobs}>
              Refresh
            </button>
          </div>
        </div>

        {fetchError && (
          <div
            style={{
              border: '3px solid var(--color-danger)',
              background: 'var(--color-surface)',
              padding: '16px 20px',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--color-danger)',
            }}
          >
            {fetchError}
          </div>
        )}

        {loading ? (
          <div
            style={{
              border: '3px solid var(--color-border)',
              background: 'var(--color-surface)',
              padding: '48px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
            }}
          >
            Loading…
          </div>
        ) : deduped.length === 0 ? (
          <div
            className="b-border"
            style={{
              background: 'var(--color-surface)',
              padding: '64px 32px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '64px',
                color: 'var(--color-hawk)',
                lineHeight: 1,
                marginBottom: '16px',
              }}
            >
              —
            </div>
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '20px',
                margin: '0 0 8px',
              }}
            >
              No reviews yet
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-muted)', margin: 0 }}>
              Open a pull request on a repo where DiffHawk is installed.
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Pull Request</th>
                  <th>Findings</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {deduped.map((job) => {
                  const findings = job.result?.findings ?? [];
                  const byS = {
                    blocker: findings.filter((f) => f.severity === 'blocker').length,
                    major: findings.filter((f) => f.severity === 'major').length,
                    minor: findings.filter((f) => f.severity === 'minor').length,
                    nit: findings.filter((f) => f.severity === 'nit').length,
                  };
                  const isOpen = expandedId === job.id;

                  return (
                  <Fragment key={job.id}>
                    <tr
                      className="job-row"
                      onClick={() => setExpandedId(isOpen ? null : job.id)}
                      aria-expanded={isOpen}
                    >
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            fontWeight: 600,
                          }}
                        >
                          {job.owner}/{job.repo}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px' }}>
                        <a
                          href={job.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none', color: 'inherit' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              color: 'var(--color-muted)',
                              marginRight: '8px',
                            }}
                          >
                            #{job.prNumber}
                          </span>
                          <span
                            style={{
                              fontSize: '13px',
                              display: 'inline-block',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'middle',
                            }}
                          >
                            {job.prTitle}
                          </span>
                        </a>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {job.status === 'completed' ? (
                            findings.length === 0 ? (
                              <span className="badge badge-ok">✓ clean</span>
                            ) : (
                              <>
                                <SevPill sev="blocker" count={byS.blocker} />
                                <SevPill sev="major" count={byS.major} />
                                <SevPill sev="minor" count={byS.minor} />
                                <SevPill sev="nit" count={byS.nit} />
                              </>
                            )
                          ) : job.status === 'failed' ? (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '11px',
                                color: 'var(--color-danger)',
                                maxWidth: '240px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={job.failedReason ?? ''}
                            >
                              {job.failedReason ?? 'Unknown error'}
                            </span>
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            color: 'var(--color-muted)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {timeAgo(job.timestamp)}
                        </span>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="job-detail">
                        <td colSpan={5} style={{ padding: 0 }}>
                          {job.result ? (
                            <div>
                              <div
                                style={{
                                  padding: '12px 24px',
                                  borderBottom: '2px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  background: 'var(--color-paper)',
                                }}
                              >
                                <span className="section-label">Summary</span>
                                <span style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
                                  {job.result.summary}
                                </span>
                              </div>
                              <FindingsPanel findings={job.result.findings} />
                            </div>
                          ) : (
                            <div style={{ padding: '20px 24px', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-muted)' }}>
                              {job.failedReason ?? 'No detail available.'}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
