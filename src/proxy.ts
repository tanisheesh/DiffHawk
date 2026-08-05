import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequestWithAuth } from 'next-auth/middleware';
import { randomBytes } from 'node:crypto';

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets scripts loaded by a nonced script run without listing them explicitly.
    // This replaces 'unsafe-inline' — inline scripts only execute when they carry the correct nonce,
    // which Next.js injects automatically when it sees the x-nonce request header.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const nonce = randomBytes(16).toString('base64');
    const csp = buildCsp(nonce);

    // Pass nonce to Next.js via request header — Next.js 13.4.20+ automatically
    // stamps this nonce onto the <script> tags it generates for hydration.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  },
  {
    callbacks: {
      authorized({ req, token }) {
        // Require a valid session only for the dashboard; allow everything else through
        if (req.nextUrl.pathname.startsWith('/dashboard')) {
          return !!token;
        }
        return true;
      },
    },
    pages: { signIn: '/' },
  }
);

export const config = {
  // Match all page routes; exclude static assets and API routes
  // (API routes handle their own auth and don't need CSP headers)
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api).*)', '/'],
};
