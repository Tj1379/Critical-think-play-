"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/profiles");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get("next") || "/profiles");
  }, []);

  const signInWithMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}${nextPath}`
        }
      });
      if (error) throw error;
      setStatus("Magic link sent. Check your email.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(nextPath);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Password sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4">
      <div className="rounded-3xl bg-white/85 p-6 shadow-md">
        <h1 className="text-2xl font-black text-ink">Parent Login</h1>
        <p className="mt-1 text-sm text-ink/70">Sign in to manage child profiles and track progress.</p>

        <form className="mt-6 space-y-3" onSubmit={signInWithMagicLink}>
          <label className="block text-sm font-semibold text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
              placeholder="you@example.com"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-leaf px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            Send Magic Link
          </button>
        </form>

        <form className="mt-6 space-y-3" onSubmit={signInWithPassword}>
          <label className="block text-sm font-semibold text-ink">
            Password (optional)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-leaf/20 px-3 py-2"
              placeholder="Enter password"
            />
          </label>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-xl bg-ink px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            Sign In With Password
          </button>
        </form>

        {status && <p className="mt-4 text-sm text-ink/80">{status}</p>}
      </div>
    </div>
  );
}
