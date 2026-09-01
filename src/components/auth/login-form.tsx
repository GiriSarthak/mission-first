"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ callbackUrl }: { callbackUrl: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await loginAction(email, password);
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.push(callbackUrl || result.redirectTo);
      router.refresh();
    } catch {
      setError("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  const field =
    "h-[26px] w-full border border-mf-border bg-white px-2 text-[12px] text-mf-text-1 outline-none focus:border-mf-accent";

  return (
    <div className="w-full max-w-90">
      <div className="mb-3 text-[13px] font-semibold tracking-[0.18em] text-mf-text-1">
        MISSION FIRST
      </div>
      <form onSubmit={submit} className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Sign in</span>
        </div>
        <div className="grid gap-3 p-3">
          <div>
            <label className="mf-heading mb-1 block text-mf-text-2" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mf-heading mb-1 block text-mf-text-2" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </div>
          {error && (
            <div className="border-l-2 border-mf-critical bg-[#fdf1ef] px-2 py-1 text-[11px] text-mf-critical">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex h-[26px] items-center justify-center gap-1.5 border border-mf-accent bg-mf-accent text-[12px] text-white transition-colors duration-100 hover:bg-mf-accent-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
      <div className="mt-2 text-[10px] text-mf-text-2">
        Tender intelligence platform · agency and vendor access
      </div>
    </div>
  );
}
