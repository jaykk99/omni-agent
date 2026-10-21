"use client";

import { useState } from "react";

export type TerminalEntry = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export default function TerminalPane({
  entries,
  onClear,
}: {
  entries: TerminalEntry[];
  onClear?: () => void;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function copyEntry(entry: TerminalEntry, idx: number) {
    const text =
      `$ ${entry.command}\n` +
      (entry.stdout ? `${entry.stdout}\n` : "") +
      (entry.stderr ? `${entry.stderr}\n` : "") +
      (entry.exitCode !== 0 ? `(exit code ${entry.exitCode})\n` : "");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      // Clipboard unavailable (non-secure context) — the user can still
      // select the text manually.
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-base-700 px-4 py-3">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Terminal
        </span>
        {entries.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-base-800 hover:text-white"
            title="Clear terminal output"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-black p-4 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-neutral-500">
            The assistant&apos;s terminal output will show up here once it runs a
            command in this chat&apos;s sandbox.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, i) => (
              <div key={i} className="group/term">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-accent-400">$ {entry.command}</div>
                  <button
                    type="button"
                    onClick={() => copyEntry(entry, i)}
                    aria-label={
                      copiedIdx === i ? "Copied" : "Copy terminal output"
                    }
                    title={copiedIdx === i ? "Copied" : "Copy terminal output"}
                    className="shrink-0 rounded px-1.5 py-0.5 text-neutral-500 opacity-0 transition hover:bg-neutral-800 hover:text-white focus:opacity-100 group-hover/term:opacity-100"
                  >
                    {copiedIdx === i ? "✓" : "⧉"}
                  </button>
                </div>
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap text-neutral-200">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="whitespace-pre-wrap text-red-400">{entry.stderr}</pre>
                )}
                {entry.exitCode !== 0 && (
                  <div className="text-neutral-500">(exit code {entry.exitCode})</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
