"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "@/components/Markdown";

// The simple chatbot page (/chat): a minimal dark-mode chat wired to the
// app's existing OpenRouter gateway path. Unlike the main agent shell it
// has no sessions, browser, or terminal — the conversation lives in this
// component and the recent history is sent with each turn. The owner's
// pasted API key is held server-side in an httpOnly cookie (see
// /api/openrouter/key); this component only ever sees it masked.

type SimpleMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
};

type ModelOption = { id: string; label: string };

type KeyStatus = {
  source: "session" | "env" | null;
  sessionKeyMasked: string | null;
  envKeyMasked: string | null;
};

const MODEL_STORAGE_KEY = "omni_openrouter_model";

const SUGGESTIONS = [
  "Explain quantum computing like I'm five",
  "Write a haiku about debugging",
  "Draft a polite follow-up email",
  "Give me a 7-day study plan for TypeScript",
];

let nextId = 1;

export default function SimpleChat() {
  const [messages, setMessages] = useState<SimpleMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/openrouter/models")
      .then((r) => r.json())
      .then((data: { models?: ModelOption[]; defaultModel?: string }) => {
        const list = data.models ?? [];
        setModels(list);
        let initial = data.defaultModel ?? list[0]?.id ?? "";
        try {
          const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
          if (saved && list.some((m) => m.id === saved)) initial = saved;
        } catch {
          // localStorage unavailable — use the server default.
        }
        setModel(initial);
      })
      .catch(() => {
        // Picker stays empty; the server still applies its default model.
      });
    refreshKeyStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only loads
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function refreshKeyStatus() {
    try {
      const res = await fetch("/api/openrouter/key");
      if (res.ok) setKeyStatus((await res.json()) as KeyStatus);
    } catch {
      // Leave the previous status — the chat route reports a missing key
      // plainly if it comes to that.
    }
  }

  function updateModel(next: string) {
    setModel(next);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      // Won't persist across reloads — fine.
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setSending(true);
    const history: SimpleMessage[] = [
      ...messages,
      { id: nextId++, role: "user", content: trimmed },
    ];
    setMessages(history);
    try {
      const res = await fetch("/api/openrouter/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => !m.failed)
            .slice(-50)
            .map((m) => ({ role: m.role, content: m.content })),
          model: model || undefined,
        }),
      });
      let data: { reply?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        data = {
          error: `The server didn't respond properly (HTTP ${res.status}). Please try again.`,
        };
      }
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          content:
            data.reply ??
            data.error ??
            "Something went wrong — please try again.",
          failed: !data.reply,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          content: "Couldn't reach the server — check your connection and try again.",
          failed: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function saveKey() {
    const apiKey = keyInput.trim();
    if (!apiKey || keyBusy) return;
    setKeyBusy(true);
    setKeyNote(null);
    try {
      const res = await fetch("/api/openrouter/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKeyNote(data.error ?? "Couldn't save that key — try again.");
        return;
      }
      setKeyInput("");
      setKeyNote(`Saved. This browser will use your key (${data.masked}).`);
      await refreshKeyStatus();
    } catch {
      setKeyNote("Couldn't reach the server — the key wasn't saved.");
    } finally {
      setKeyBusy(false);
    }
  }

  async function removeKey() {
    if (keyBusy) return;
    setKeyBusy(true);
    setKeyNote(null);
    try {
      await fetch("/api/openrouter/key", { method: "DELETE" });
      setKeyNote("Your pasted key was removed from this browser.");
      await refreshKeyStatus();
    } catch {
      setKeyNote("Couldn't reach the server — the key is still saved.");
    } finally {
      setKeyBusy(false);
    }
  }

  const keyReady = keyStatus !== null && keyStatus.source !== null;
  const activeKeyMasked =
    keyStatus?.source === "session"
      ? keyStatus.sessionKeyMasked
      : keyStatus?.envKeyMasked;

  return (
    <div className="flex h-dvh flex-col bg-base-950 text-white">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-700 px-4 py-3">
        <a
          href="/"
          className="rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-base-800 hover:text-white"
        >
          ← Agent
        </a>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">Simple Chat</h1>
          <p className="text-xs leading-tight text-neutral-500">
            OpenRouter · open-weight models
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => updateModel(e.target.value)}
            disabled={models.length === 0}
            aria-label="Model"
            className="max-w-[13rem] rounded-lg border border-base-600 bg-base-800 px-2 py-1.5 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-50 sm:max-w-xs"
          >
            {models.length === 0 && <option value="">Loading models…</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setKeyPanelOpen((open) => !open)}
            className="rounded-lg border border-base-600 bg-base-800 px-2.5 py-1.5 text-sm text-neutral-200 hover:bg-base-700"
            aria-expanded={keyPanelOpen}
          >
            🔑 API key
            {keyStatus !== null && (
              <span className="ml-1.5 text-xs text-neutral-400">
                {keyReady ? (activeKeyMasked ?? "set") : "not set"}
              </span>
            )}
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="rounded-lg px-2 py-1.5 text-sm text-neutral-400 hover:bg-base-800 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* API key panel */}
      {keyPanelOpen && (
        <div className="border-b border-base-700 bg-base-900 px-4 py-4">
          <div className="mx-auto w-full max-w-3xl">
            <label
              htmlFor="openrouter-key"
              className="mb-2 block text-xs uppercase tracking-wide text-neutral-500"
            >
              Your OpenRouter API key
            </label>
            {keyStatus?.source === "session" && (
              <p className="mb-2 text-sm text-neutral-300">
                This browser is using your pasted key (
                {keyStatus.sessionKeyMasked}
                ).
                {keyStatus.envKeyMasked &&
                  " It overrides the server key for this browser."}
              </p>
            )}
            {keyStatus?.source === "env" && (
              <p className="mb-2 text-sm text-neutral-300">
                A server key is configured ({keyStatus.envKeyMasked}).
                Pasting your own key overrides it for this browser only.
              </p>
            )}
            {keyStatus?.source === null && (
              <p className="mb-2 text-sm text-neutral-300">
                No key yet — paste yours to start chatting.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                id="openrouter-key"
                type="password"
                autoComplete="off"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveKey();
                }}
                placeholder="sk-or-…"
                className="min-w-0 flex-1 rounded-lg border border-base-600 bg-base-800 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-accent-500"
              />
              <button
                onClick={saveKey}
                disabled={keyBusy || !keyInput.trim()}
                className="rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium hover:bg-accent-400 disabled:opacity-50"
              >
                Save key
              </button>
              {keyStatus?.source === "session" && (
                <button
                  onClick={removeKey}
                  disabled={keyBusy}
                  className="rounded-lg bg-base-800 px-3 py-2 text-sm text-neutral-300 hover:bg-base-700 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Stored only in an httpOnly cookie in this browser and sent to
              the server with your requests — never saved on the server,
              never logged, and only ever shown back masked.
            </p>
            {keyNote && (
              <p className="mt-2 text-sm text-neutral-200">{keyNote}</p>
            )}
          </div>
        </div>
      )}

      {/* No-key notice */}
      {keyStatus !== null && !keyReady && !keyPanelOpen && (
        <div className="w-full shrink-0 border-b border-amber-800/60 bg-amber-950/50 px-4 py-2">
          <p className="mx-auto max-w-3xl text-xs text-amber-200">
            ⚠ No OpenRouter key yet — open “🔑 API key” above and paste yours
            to start chatting.
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="pt-10 text-center">
              <p className="text-base font-medium text-neutral-200">
                A plain chatbot, nothing else.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
                Pick a model up top and ask anything. Chats here aren&apos;t
                saved — reload and they&apos;re gone.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-base-600 bg-base-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-base-700 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="msg-in max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-500 px-4 py-3 text-sm leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex">
                <div
                  className={`msg-in max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed ${
                    m.failed
                      ? "border border-red-800/60 bg-red-950/50 text-red-200"
                      : "bg-base-800"
                  }`}
                >
                  {m.failed ? (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  ) : (
                    <Markdown text={m.content} />
                  )}
                </div>
              </div>
            )
          )}
          {sending && (
            <div className="flex">
              <div
                className="msg-in flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-base-800 px-4 py-3"
                aria-label="Assistant is typing"
              >
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-base-700 px-4 py-3">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Message…"
            aria-label="Message"
            className="max-h-40 min-w-0 flex-1 resize-none rounded-lg border border-base-600 bg-base-800 px-3 py-2.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-accent-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium hover:bg-accent-400 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
