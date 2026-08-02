'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; login?: string; avatarUrl?: string; image?: string } | undefined;
  const avatarSrc = user?.avatarUrl ?? user?.image;
  const displayName = user?.login ?? user?.name ?? 'User';

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-paper)' }}>
      <nav className="site-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: 0 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
            <Logo size={28} />
          </Link>
          <span
            className="nav-username"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              paddingLeft: '20px',
              borderLeft: '2px solid var(--color-border)',
              whiteSpace: 'nowrap',
            }}
          >
            Dashboard
          </span>
        </div>

        <div className="nav-user">
          {avatarSrc && (
            <img
              src={avatarSrc}
              alt={displayName}
              width={30}
              height={30}
              style={{ border: '2px solid var(--color-border)', display: 'block', flexShrink: 0 }}
            />
          )}
          <span
            className="nav-username"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            @{displayName}
          </span>
          <button
            className="btn btn-sm"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
