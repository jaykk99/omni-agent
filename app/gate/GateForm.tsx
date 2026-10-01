"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export default function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const t = setInterval(
      () => setLockedFor((v) => Math.max(0, v - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [lockedFor]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lockedFor > 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/");
      router.refresh();
    } else if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      setLockedFor(
        typeof data.retryAfter === "number" ? data.retryAfter : 900
      );
      setError(
        data.error ?? "Too many wrong PINs — try again later."
      );
      setPin("");
    } else {
      setError("Wrong PIN.");
      setPin("");
    }
  }

  const locked = lockedFor > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-base-700 bg-base-900 p-8 shadow-xl"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 text-xl shadow-lg shadow-accent-500/20">
          ✦
        </div>
        <h1 className="mb-1 text-2xl font-semibold text-white">Omni Agent</h1>
        <p className="mb-6 text-sm text-neutral-400">
          Enter the PIN to continue.
        </p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          disabled={locked || loading}
          className="mb-3 w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white outline-none transition focus:border-accent-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || locked || !pin}
          className="w-full rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-400 disabled:opacity-50"
        >
          {locked
            ? `Locked — try again in ${formatCountdown(lockedFor)}`
            : loading
              ? "Checking…"
              : "Enter"}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
