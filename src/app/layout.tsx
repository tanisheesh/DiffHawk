import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DiffHawk',
  description: 'Automated GitHub PR reviews powered by Groq + Llama',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-zinc-800 px-6 py-4">
          <div className="mx-auto max-w-5xl flex items-center gap-3">
            <span className="text-xl">🤖</span>
            <span className="font-semibold text-lg tracking-tight">DiffHawk</span>
            <span className="ml-auto text-xs text-zinc-500">Groq · Llama · BullMQ</span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
