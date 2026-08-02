'use client';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import { Logo, HawkEye } from '@/components/Logo';

const GH_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export default function LandingPage() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const user = session?.user as { name?: string; login?: string; avatarUrl?: string; image?: string } | undefined;
  const avatarSrc = user?.avatarUrl ?? user?.image;
  const displayName = user?.login ?? user?.name;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ─────────────────────────────────────── */}
      <nav className="site-nav">
        <Logo size={30} />
        <div className="nav-user">
          {isAuthed ? (
            <>
              {avatarSrc && (
                <img
                  src={avatarSrc}
                  alt={displayName ?? 'User'}
                  width={28}
                  height={28}
                  style={{ border: '2px solid var(--color-border)', display: 'block', flexShrink: 0 }}
                />
              )}
              {displayName && (
                <span
                  className="nav-username"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 500 }}
                >
                  @{displayName}
                </span>
              )}
              <Link href="/dashboard" className="btn btn-hawk btn-sm">
                Dashboard →
              </Link>
            </>
          ) : (
            <button
              className="btn btn-hawk btn-sm"
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
            >
              Sign in with GitHub
              {GH_ICON}
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="hero-section">
        <div style={{ minWidth: 0 }}>
          <p className="section-label" style={{ color: 'var(--color-hawk)', marginBottom: '24px' }}>
            AI-powered · GitHub native · Zero config
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(48px, 9vw, 108px)',
              lineHeight: 0.9,
              letterSpacing: '-0.01em',
              margin: '0 0 28px',
              textWrap: 'balance',
            }}
          >
            CATCH BUGS<br />
            <span style={{ color: 'var(--color-hawk)' }}>BEFORE</span><br />
            THEY SHIP.
          </h1>
          <p
            style={{
              fontSize: 'clamp(15px, 2vw, 18px)',
              lineHeight: 1.65,
              color: '#999390',
              maxWidth: '500px',
              marginBottom: '40px',
            }}
          >
            DiffHawk reviews every pull request — posting inline diff comments, ranking issues by severity, and emailing you a summary. Automated. Instant.
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {isAuthed ? (
              <Link
                href="/dashboard"
                className="btn btn-hawk"
                style={{ fontSize: '16px', padding: '14px 30px' }}
              >
                Go to Dashboard →
              </Link>
            ) : (
              <button
                className="btn btn-hawk"
                style={{ fontSize: '16px', padding: '14px 30px' }}
                onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              >
                Get started free →
              </button>
            )}
            <a
              href="https://github.com/tanisheesh/DiffHawk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ fontSize: '16px', padding: '14px 30px', color: 'var(--color-paper)', borderColor: '#2E2E2E' }}
            >
              View source ↗
            </a>
          </div>
        </div>

        <div className="hero-eye" style={{ flexShrink: 0 }}>
          <div
            style={{
              border: '3px solid #2E2E2E',
              boxShadow: '6px 6px 0 var(--color-hawk)',
              padding: 'clamp(24px, 4vw, 48px)',
              background: '#111',
            }}
          >
            <HawkEye size={160} />
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────── */}
      <section className="stats-bar">
        {[
          { v: 'INSTANT', sub: 'Review posts in < 30 seconds' },
          { v: 'INLINE', sub: 'Comments anchored to diff lines' },
          { v: 'RANKED', sub: 'Blocker → Major → Minor → Nit' },
        ].map((s, i) => (
          <div
            key={i}
            className="stats-bar-item"
            style={{ borderRight: i < 2 ? '3px solid #0A0A0A' : 'none' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: '26px',
                color: '#0A0A0A',
                letterSpacing: '-0.01em',
              }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: '13px', color: '#3A3500', marginTop: '3px' }}>{s.sub}</div>
          </div>
        ))}
      </section>

      {/* ── How it works ────────────────────────────── */}
      <section className="content-section">
        <p className="section-label" style={{ marginBottom: '36px' }}>How it works</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {[
            {
              step: 'A',
              title: 'Install the GitHub App',
              body: 'One-click install on your account or org. Covers all repos or just the ones you choose.',
            },
            {
              step: 'B',
              title: 'Open a pull request',
              body: 'Push your branch and open a PR. DiffHawk receives the webhook event automatically — nothing to configure.',
            },
            {
              step: 'C',
              title: 'Get the review',
              body: 'Inline diff comments appear on your PR within 30 seconds, with a severity table and a summary email.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="b-border b-shadow b-hover"
              style={{ background: 'var(--color-surface)', padding: '28px' }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: '72px',
                  lineHeight: 1,
                  color: 'var(--color-hawk)',
                  marginBottom: '16px',
                }}
              >
                {item.step}
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: '22px',
                  margin: '0 0 10px',
                  letterSpacing: '-0.01em',
                }}
              >
                {item.title}
              </h3>
              <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--color-muted)', margin: 0 }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What it catches ─────────────────────────── */}
      <section className="content-section">
        <p className="section-label" style={{ marginBottom: '36px' }}>What it catches</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {[
            {
              dot: '#E02020',
              sev: 'BLOCKER',
              title: 'Security',
              items: ['SQL / command injection', 'Hardcoded secrets & tokens', 'SSRF, path traversal, auth bypass', 'Unsafe deserialization'],
            },
            {
              dot: '#F07030',
              sev: 'MAJOR',
              title: 'Bugs',
              items: ['Null / undefined deref', 'Off-by-one errors', 'Race conditions', 'Wrong API usage'],
            },
            {
              dot: '#D97706',
              sev: 'MINOR',
              title: 'Style',
              items: ['Dead code', 'Naming issues', 'Missing error handling', 'Redundant logic'],
            },
          ].map((cat) => (
            <div
              key={cat.title}
              className="b-border b-shadow"
              style={{ background: 'var(--color-surface)', padding: '28px' }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '18px' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: cat.dot,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: '11px',
                    letterSpacing: '0.14em',
                    color: cat.dot,
                  }}
                >
                  {cat.sev}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: '30px',
                  margin: '0 0 16px',
                  letterSpacing: '-0.01em',
                }}
              >
                {cat.title}
              </h3>
              <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {cat.items.map((item) => (
                  <li key={item} style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--color-muted)' }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="cta-section">
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(36px, 6vw, 72px)',
            lineHeight: 0.95,
            margin: 0,
            color: '#0A0A0A',
            maxWidth: '700px',
            textWrap: 'balance',
          }}
        >
          Stop reviewing code manually.
        </h2>
        <p style={{ fontSize: '16px', color: '#3A3500', margin: 0, maxWidth: '460px', lineHeight: 1.65 }}>
          DiffHawk never sleeps, never misses a SQL injection, and doesn&apos;t need a PR to be assigned to it.
        </p>
        {isAuthed ? (
          <Link
            href="/dashboard"
            className="btn btn-ink"
            style={{ fontSize: '16px', padding: '14px 30px' }}
          >
            Go to Dashboard →
          </Link>
        ) : (
          <button
            className="btn btn-ink"
            style={{ fontSize: '16px', padding: '14px 30px' }}
            onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
          >
            Sign in with GitHub →
          </button>
        )}
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer
        style={{
          marginTop: 'auto',
          padding: '20px clamp(20px, 5vw, 64px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          borderTop: '2px solid var(--color-border)',
        }}
      >
        <Logo size={22} />
        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          Powered by Groq · Llama 3.3 · BullMQ · Redis
        </span>
      </footer>
    </div>
  );
}
