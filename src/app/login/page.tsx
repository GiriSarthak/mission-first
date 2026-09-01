import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — Mission First" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-mf-surface-1 p-4">
      <LoginForm callbackUrl={callbackUrl ?? null} />
    </div>
  );
}
