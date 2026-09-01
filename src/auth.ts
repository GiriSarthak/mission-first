import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Credentials provider for the demo. Swap this array for an OIDC/SSO provider
 * when a government identity provider is available — the JWT/session callbacks
 * in `auth.config.ts` and every `can()` check stay untouched, as long as the
 * provider populates role/orgId/orgName/orgType on the user object.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: { org: true },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as never,
          orgId: user.orgId,
          orgName: user.org.name,
          orgType: user.org.type as "AGENCY" | "VENDOR",
        };
      },
    }),
  ],
});
