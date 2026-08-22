import type { AuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import { requireEnv } from './config';

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: requireEnv('GITHUB_OAUTH_CLIENT_ID'),
      clientSecret: requireEnv('GITHUB_OAUTH_CLIENT_SECRET'),
    }),
  ],
  secret: requireEnv('NEXTAUTH_SECRET'),
  pages: { signIn: '/' },
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.login = (profile as { login?: string }).login;
        token.avatarUrl = (profile as { avatar_url?: string }).avatar_url;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as { login?: string; avatarUrl?: string };
        user.login = typeof token.login === 'string' ? token.login : undefined;
        user.avatarUrl = typeof token.avatarUrl === 'string' ? token.avatarUrl : undefined;
      }
      return session;
    },
  },
};
