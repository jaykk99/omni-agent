"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ChatPanel, { type Message } from "@/components/ChatPanel";
import BrowserPane from "@/components/BrowserPane";

type SessionSummary = {
  id: string;
  title: string;
  created_at: string;
};

export default function AppShell({ userEmail }: { userEmail: string }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const startedBrowser = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadSessions();
  }, []);

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
    }
  }

  async function selectSession(id: string) {
    setActiveSessionId(id);
    setLiveViewUrl(null);
    const res = await fetch(`/api/messages?sessionId=${id}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
    ensureBrowser(id);
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
        body: JSON.stringify({ sessionId: activeSessionId, message: text }),
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
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex h-screen bg-base-950 text-white">
      <aside className="flex w-64 flex-col border-r border-base-700 bg-base-900">
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
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm ${
                s.id === activeSessionId
                  ? "bg-base-700 text-white"
                  : "text-neutral-400 hover:bg-base-800"
              }`}
            >
              {s.title || "New chat"}
            </button>
          ))}
        </div>
        <div className="border-t border-base-700 p-3">
          <p className="mb-2 truncate text-xs text-neutral-500">{userEmail}</p>
          <button
            onClick={signOut}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex flex-1">
        <div className="flex w-1/2 flex-col border-r border-base-700">
          <ChatPanel messages={messages} onSend={sendMessage} sending={sending} />
        </div>
        <div className="flex w-1/2 flex-col">
          <BrowserPane liveViewUrl={liveViewUrl} />
        </div>
      </main>
    </div>
  );
}
