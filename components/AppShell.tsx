"use client";

import { useEffect, useRef, useState } from "react";
import ChatPanel, { type Message } from "@/components/ChatPanel";
import BrowserPane from "@/components/BrowserPane";
import TerminalPane, { type TerminalEntry } from "@/components/TerminalPane";
import SettingsPanel, { MODEL_OPTIONS } from "@/components/SettingsPanel";

type SessionSummary = {
  id: string;
  title: string;
  created_at: string;
};

const MODEL_STORAGE_KEY = "omni_model";

export default function AppShell() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [rightTab, setRightTab] = useState<"browser" | "terminal">("browser");
  const [mobileView, setMobileView] = useState<"chat" | "right">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState(MODEL_OPTIONS[0].id);
  const startedBrowser = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadSessions();
    try {
      const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved) setModel(saved);
    } catch {
      // localStorage unavailable — fall back to the default model.
    }
  }, []);

  function updateModel(next: string) {
    setModel(next);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      // Ignore — just won't persist across reloads.
    }
  }

  async function loadSessions() {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    if (data.sessions) {
      setSessions(data.sessions);
      if (!activeSessionId && data.sessions.length > 0) {
        selectSession(data.sessions[0].id);
      } else if (data.sessions.length === 0) {
        createSession();
      }
    }
  }

  async function createSession() {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    const data = await res.json();
    if (data.session) {
      setSessions((prev) => [data.session, ...prev]);
      selectSession(data.session.id);
      setSidebarOpen(false);
    }
  }

  async function selectSession(id: string) {
    setActiveSessionId(id);
    setLiveViewUrl(null);
    setTerminalEntries([]);
    setMobileView("chat");
    const res = await fetch(`/api/messages?sessionId=${id}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
    ensureBrowser(id);
    setSidebarOpen(false);
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Delete this chat? This can't be undone.")) return;

    await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);

    if (id === activeSessionId) {
      if (remaining.length > 0) {
        selectSession(remaining[0].id);
      } else {
        setActiveSessionId(null);
        setMessages([]);
        createSession();
      }
    }
  }

  async function ensureBrowser(id: string) {
    if (startedBrowser.current.has(id)) return;
    startedBrowser.current.add(id);
    try {
      const res = await fetch("/api/browser/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const data = await res.json();
      if (data.liveViewUrl) setLiveViewUrl(data.liveViewUrl);
    } catch {
      // Browser pane stays idle if Browserbase isn't configured yet.
    }
  }

  async function sendMessage(text: string) {
    if (!activeSessionId) return;
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, message: text, model }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? data.error ?? "Something went wrong.",
        },
      ]);
      const newTerminalEntries: TerminalEntry[] = (data.events ?? [])
        .filter((e: { type: string }) => e.type === "terminal")
        .map((e: { detail: string }) => {
          try {
            return JSON.parse(e.detail);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (newTerminalEntries.length > 0) {
        setTerminalEntries((prev) => [...prev, ...newTerminalEntries]);
        setRightTab("terminal");
        setMobileView("right");
      }
    } finally {
      setSending(false);
    }
  }

  async function lockApp() {
    await fetch("/api/gate", { method: "DELETE" });
    window.location.href = "/gate";
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold">Omni Agent</span>
        <button
          onClick={createSession}
          className="rounded-md bg-accent-500 px-2 py-1 text-xs font-medium hover:bg-accent-400"
        >
          + New
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => selectSession(s.id)}
            className={`group flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
              s.id === activeSessionId
                ? "bg-base-700 text-white"
                : "text-neutral-400 hover:bg-base-800"
            }`}
          >
            <span className="truncate">{s.title || "New chat"}</span>
            <button
              onClick={(e) => deleteSession(s.id, e)}
              className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-500 opacity-0 hover:bg-base-600 hover:text-white group-hover:opacity-100"
              aria-label="Delete chat"
              title="Delete chat"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-base-700 p-3">
        <button
          onClick={lockApp}
          className="text-xs text-neutral-400 hover:text-white"
        >
          Lock
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-base-800 hover:text-white"
          aria-label="Settings"
        >
          ⚙ Settings
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-base-950 text-white md:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-base-700 p-3 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-base-800"
          aria-label="Open menu"
        >
          ☰
        </button>
        <span className="text-sm font-semibold">Omni Agent</span>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-md px-2 py-1 text-sm text-neutral-300 hover:bg-base-800"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-base-700 bg-base-900 md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="flex-1 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="flex w-72 flex-col bg-base-900">{sidebarContent}</div>
        </div>
      )}

      <main className="flex flex-1 flex-col md:flex-row">
        {/* Mobile view switcher */}
        <div className="flex border-b border-base-700 md:hidden">
          <button
            onClick={() => setMobileView("chat")}
            className={`flex-1 px-4 py-2 text-xs uppercase tracking-wide ${
              mobileView === "chat"
                ? "bg-base-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => {
              setRightTab("browser");
              setMobileView("right");
            }}
            className={`flex-1 px-4 py-2 text-xs uppercase tracking-wide ${
              mobileView === "right" && rightTab === "browser"
                ? "bg-base-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Browser
          </button>
          <button
            onClick={() => {
              setRightTab("terminal");
              setMobileView("right");
            }}
            className={`flex-1 px-4 py-2 text-xs uppercase tracking-wide ${
              mobileView === "right" && rightTab === "terminal"
                ? "bg-base-800 text-white"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Terminal
          </button>
        </div>

        <div
          className={`${
            mobileView === "chat" ? "flex" : "hidden"
          } w-full flex-col border-r border-base-700 md:flex md:w-1/2`}
        >
          <ChatPanel messages={messages} onSend={sendMessage} sending={sending} />
        </div>
        <div
          className={`${
            mobileView === "right" ? "flex" : "hidden"
          } w-full flex-col md:flex md:w-1/2`}
        >
          <div className="hidden border-b border-base-700 md:flex">
            <button
              onClick={() => setRightTab("browser")}
              className={`flex-1 px-4 py-2 text-xs uppercase tracking-wide ${
                rightTab === "browser"
                  ? "bg-base-800 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Browser
            </button>
            <button
              onClick={() => setRightTab("terminal")}
              className={`flex-1 px-4 py-2 text-xs uppercase tracking-wide ${
                rightTab === "terminal"
                  ? "bg-base-800 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Terminal
            </button>
          </div>
          <div className="flex-1">
            {rightTab === "browser" ? (
              <BrowserPane liveViewUrl={liveViewUrl} />
            ) : (
              <TerminalPane entries={terminalEntries} />
            )}
          </div>
        </div>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        model={model}
        onModelChange={updateModel}
        onLock={lockApp}
      />
    </div>
  );
}
