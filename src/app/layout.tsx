import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'DiffHawk', template: '%s · DiffHawk' },
  description: 'Automated GitHub PR code review — inline comments, severity ranking, email summaries.',
  icons: {
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
