import type { AuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
    }),
  ],
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
        (session.user as { login?: string; avatarUrl?: string }).login = token.login as string;
        (session.user as { login?: string; avatarUrl?: string }).avatarUrl = token.avatarUrl as string;
      }
      return session;
    },
  },
};
