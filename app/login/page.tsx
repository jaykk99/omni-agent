"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-base-700 bg-base-900 p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-semibold text-white">Omni Agent</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Sign in to chat with an assistant that can browse the web live.
        </p>

        {sent ? (
          <p className="rounded-lg bg-accent-500/10 p-3 text-sm text-accent-400">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-400 disabled:opacity-50"
            >
              {loading ? "Sending link…" : "Send magic link"}
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
