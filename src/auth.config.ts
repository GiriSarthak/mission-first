import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/auth/roles";

/**
 * Edge-safe half of the Auth.js config: no Prisma, no bcrypt, so it can run in
 * middleware. The credentials provider lives in `src/auth.ts`.
 *
 * Replacing the credentials provider with a government SSO/OIDC provider later
 * means editing `src/auth.ts` only — the session shape and every permission
 * check below stay as they are.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: Role }).role;
        token.orgId = (user as { orgId: string }).orgId;
        token.orgName = (user as { orgName: string }).orgName;
        token.orgType = (user as { orgType: "AGENCY" | "VENDOR" }).orgType;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as Role;
        session.user.orgId = token.orgId as string;
        session.user.orgName = token.orgName as string;
        session.user.orgType = token.orgType as "AGENCY" | "VENDOR";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
