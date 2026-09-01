import type { Role } from "@/lib/auth/roles";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      orgId: string;
      orgName: string;
      orgType: "AGENCY" | "VENDOR";
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    orgId: string;
    orgName: string;
    orgType: "AGENCY" | "VENDOR";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    orgId: string;
    orgName: string;
    orgType: "AGENCY" | "VENDOR";
  }
}
