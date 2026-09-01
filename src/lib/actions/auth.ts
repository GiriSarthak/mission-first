"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { homePathForRole, type Role } from "@/lib/auth/roles";

export async function loginAction(
  email: string,
  password: string
): Promise<{ error: string } | { redirectTo: string }> {
  const normalized = email.toLowerCase().trim();
  try {
    await signIn("credentials", {
      email: normalized,
      password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Incorrect email or password." };
    }
    throw err;
  }

  const user = await db.user.findUnique({
    where: { email: normalized },
    select: { role: true },
  });
  return { redirectTo: homePathForRole((user?.role ?? "VENDOR_MEMBER") as Role) };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
