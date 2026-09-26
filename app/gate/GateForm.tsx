"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function GateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    } else {
      setError("Wrong PIN.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-base-700 bg-base-900 p-8 shadow-xl"
      >
        <h1 className="mb-1 text-2xl font-semibold text-white">Omni Agent</h1>
        <p className="mb-6 text-sm text-neutral-400">Enter the PIN to continue.</p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="mb-3 w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
        />
        <button
          type="submit"
          disabled={loading || !pin}
          className="w-full rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-400 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
