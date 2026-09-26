"use client";

import { useState } from "react";
import clsx from "clsx";

export type Message = {
  id: string;
  role: string;
  content: string;
};

export default function ChatPanel({
  messages,
  onSend,
  sending,
}: {
  messages: Message[];
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Ask anything — I can browse live to check current info. Try
            &ldquo;look up today&rsquo;s top story on Hacker News&rdquo;.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={clsx(
              "max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-accent-500 text-white"
                : "bg-base-800 text-neutral-100"
            )}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="max-w-[85%] rounded-2xl bg-base-800 px-4 py-2 text-sm text-neutral-400">
            Thinking…
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-base-700 p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Omni Agent…"
            className="flex-1 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm outline-none focus:border-accent-500"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium hover:bg-accent-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
