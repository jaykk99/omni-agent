"use client";

export const MODEL_OPTIONS = [
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "google/gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
];

export default function SettingsPanel({
  open,
  onClose,
  model,
  onModelChange,
  onLock,
}: {
  open: boolean;
  onClose: () => void;
  model: string;
  onModelChange: (model: string) => void;
  onLock: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="h-full w-full max-w-sm bg-base-900 p-5 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:text-white"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-xs uppercase tracking-wide text-neutral-500">
            Model
          </label>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="w-full rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-neutral-500">
            Applies to new messages in this chat and any others you send.
          </p>
        </div>

        <div className="border-t border-base-700 pt-5">
          <button
            onClick={onLock}
            className="w-full rounded-lg bg-base-800 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-base-700"
          >
            Lock app
          </button>
        </div>
      </div>
    </div>
  );
}
