"use client";

export type TerminalEntry = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export default function TerminalPane({ entries }: { entries: TerminalEntry[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-base-700 px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">
        Terminal
      </div>
      <div className="flex-1 overflow-y-auto bg-black p-4 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-neutral-500">
            The assistant's terminal output will show up here once it runs a
            command in this chat's sandbox.
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, i) => (
              <div key={i}>
                <div className="text-accent-400">$ {entry.command}</div>
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
