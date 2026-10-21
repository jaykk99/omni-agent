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

type SearchHit = {
  session_id: string;
  session_title: string;
  message_id: string;
  role: string;
  snippet: string;
  created_at: string;
};

const MODEL_STORAGE_KEY = "omni_model";

export default function AppShell() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [browserStatus, setBrowserStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastInput, setLastInput] = useState<string | null>(null);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [rightTab, setRightTab] = useState<"browser" | "terminal">("browser");
  const [mobileView, setMobileView] = useState<"chat" | "right">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState(MODEL_OPTIONS[0].id);
  // Cross-chat message search.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  // What the server can actually do right now (drives the keyless-mode
  // banner and the chat empty state — never a silent degradation).
  const [status, setStatus] = useState<{
    database: boolean;
    gateway: boolean;
    pin: boolean;
  } | null>(null);
  const browserReady = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    loadSessions();
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setStatus(s))
      .catch(() => {
        // Status endpoint unreachable — don't block the app over it.
      });
    try {
      const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved) setModel(saved);
    } catch {
      // localStorage unavailable — fall back to the default model.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial session load
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

  async function selectSession(id: string, highlightMessageId?: string) {
    setActiveSessionId(id);
    setLiveViewUrl(null);
    setScreenshotUrl(null);
    setBrowserStatus(null);
    setTerminalEntries([]);
    setMobileView("chat");
    setHighlightId(highlightMessageId ?? null);
    const res = await fetch(`/api/messages?sessionId=${id}`);
    const data = await res.json();
    setMessages(
      (data.messages ?? []).map(
        (m: { id: string; role: string; content: string; created_at?: string }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        })
      )
    );
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

  // Debounced cross-chat search — fires 300ms after the user stops typing.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchHits(res.ok ? data.hits ?? [] : []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  function exportSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    // The export route returns a Content-Disposition download; assigning
    // location keeps it a simple one-liner without blob juggling.
    const a = document.createElement("a");
    a.href = `/api/sessions/export?id=${encodeURIComponent(id)}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importSessionFile(file: File) {
    setImportError(null);
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setImportError("That file isn't valid JSON.");
      return;
    }
    const res = await fetch("/api/sessions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.session) {
      setImportError(data.error ?? "Import failed.");
      return;
    }
    const imported = data.session as SessionSummary;
    setSessions((prev) => [imported, ...prev]);
    setSearchQuery("");
    selectSession(imported.id);
  }

  function jumpToHit(hit: SearchHit) {
    setSearchQuery("");
    setSearchHits(null);
    selectSession(hit.session_id, hit.message_id);
  }

  function ensureBrowser(id: string) {
    if (browserReady.current.has(id)) return browserReady.current.get(id)!;
    const promise = (async () => {
      setBrowserStatus("Starting browser… (a new chat's first start takes about 30 seconds)");
      try {
        const res = await fetch("/api/browser/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        });
        const data = await res.json();
        if (data.liveViewUrl) setLiveViewUrl(data.liveViewUrl);
        if (data.screenshotDataUrl) setScreenshotUrl(data.screenshotDataUrl);
        setBrowserStatus(data.error ? `Browser couldn't start: ${String(data.error).slice(0, 200)}` : null);
      } catch {
        setBrowserStatus("Browser couldn't start — it will retry when the assistant next uses it.");
      }
    })();
    browserReady.current.set(id, promise);
    return promise;
  }

  async function sendMessage(text: string) {
    if (!activeSessionId) return;
    setSending(true);
    setLastInput(text);
    const localUserId = `local-${Date.now()}`;
    const localReplyId = `reply-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: localUserId, role: "user", content: text },
    ]);
    try {
      // The sandbox browser session has to exist (and its id stored on the
      // session row) *before* /api/chat runs, or the chat route's own
      // get-or-create fallback races this call and the pane can show a stale
      // state. Awaiting here (already in flight from selectSession, usually
      // resolved by the time someone finishes typing) keeps one sandbox per
      // chat.
      await ensureBrowser(activeSessionId);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, message: text, model }),
      });
      // A platform-level failure (timeout, crash) comes back as an HTML error
      // page, not JSON — surface that instead of silently showing nothing.
      let data: {
        reply?: string;
        error?: string;
        userMessageId?: string;
        assistantMessageId?: string;
        events?: { type: string; detail?: string }[];
      };
      try {
        data = await res.json();
      } catch {
        data = {
          error: `The server didn't respond properly (HTTP ${res.status}). Please try again.`,
        };
      }
      // The server stored both messages — swap the local placeholder ids for
      // the real stored ids so per-message actions (delete/edit/regenerate)
      // can target them.
      const storedUserId = data.userMessageId ?? localUserId;
      const storedReplyId = data.assistantMessageId ?? localReplyId;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localUserId ? { ...m, id: storedUserId } : m
        )
      );
      const events = data.events ?? [];
      const latestScreenshot = [...events].reverse().find((e) => e.type === "screenshot");
      const visited = events
        .filter((e) => e.type === "navigate" && e.detail && e.detail !== "error" && e.detail !== "about:blank")
        .map((e) => e.detail as string)
        .filter((url, i, arr) => arr.indexOf(url) === i);
      // Server-side degradations (e.g. gateway failed → keyless fallback)
      // arrive as notice events; show them inline so nothing is silent.
      const notices = events.filter((e) => e.type === "notice" && e.detail);
      setMessages((prev) => [
        ...prev,
        ...notices.map((n, i) => ({
          id: `notice-${Date.now()}-${i}`,
          role: "notice",
          content: n.detail as string,
        })),
        {
          id: storedReplyId,
          role: "assistant",
          content: data.reply ?? data.error ?? "Something went wrong.",
          screenshot: latestScreenshot?.detail,
          visited,
        },
      ]);
      if (latestScreenshot?.detail) {
        setScreenshotUrl(latestScreenshot.detail);
        setBrowserStatus(null);
      }

      const newTerminalEntries: TerminalEntry[] = events
        .filter((e) => e.type === "terminal")
        .map((e) => {
          try {
            return JSON.parse(e.detail ?? "") as TerminalEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is TerminalEntry => e !== null);
      if (newTerminalEntries.length > 0) {
        setTerminalEntries((prev) => [...prev, ...newTerminalEntries]);
        setRightTab("terminal");
        setMobileView("right");
      } else if (latestScreenshot) {
        // Desktop: bring the browser tab forward if the terminal was showing.
        setRightTab("browser");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: "assistant",
          content:
            "Couldn't reach the server — check your connection and try again.",
          failed: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function retryLast() {
    if (lastInput && !sending) sendMessage(lastInput);
  }

  async function lockApp() {
    await fetch("/api/gate", { method: "DELETE" });
    window.location.href = "/gate";
  }

  // ---- Per-message actions ------------------------------------------------

  /** True for client-only placeholder ids that were never stored server-side. */
  function isLocalMessage(id: string) {
    return (
      id.startsWith("local-") ||
      id.startsWith("reply-") ||
      id.startsWith("notice-")
    );
  }

  async function deleteChatMessage(id: string) {
    if (!activeSessionId || sending) return;
    if (isLocalMessage(id)) {
      // Never stored (e.g. a failed send) — just drop it from the view.
      setMessages((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    if (!window.confirm("Delete this message?")) return;
    const res = await fetch(
      `/api/messages?sessionId=${activeSessionId}&messageId=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  /** Rewind the stored chat to one of the user's messages, then resend the
   *  (possibly edited) text as a fresh message. */
  async function rewindAndResend(fromId: string, text: string) {
    if (!activeSessionId || sending || !text.trim()) return;
    if (!isLocalMessage(fromId)) {
      const res = await fetch(
        `/api/messages?sessionId=${activeSessionId}&truncateFrom=${encodeURIComponent(fromId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) return;
    }
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === fromId);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    sendMessage(text.trim());
  }

  /** Re-run the assistant's answer to the latest user message. */
  function regenerateReply() {
    if (sending) return;
    let lastUser: Message | null = null;
    for (const m of messages) {
      if (m.role === "user") lastUser = m;
    }
    if (lastUser) rewindAndResend(lastUser.id, lastUser.content);
  }

  // ---- Chat rename ---------------------------------------------------------

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  function startRename(s: SessionSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(s.id);
    setRenameText(s.title || "");
  }

  async function saveRename(id: string) {
    const title = renameText.replace(/\s+/g, " ").trim();
    setRenamingId(null);
    if (!title) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    try {
      const res = await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      if (!res.ok) {
        // Roll back the optimistic title on failure.
        const fresh = await (await fetch("/api/sessions")).json();
        if (fresh.sessions) setSessions(fresh.sessions);
      }
    } catch {
      // Offline — the optimistic title stays for this view only.
    }
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold">Omni Agent</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => importInputRef.current?.click()}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-300 hover:bg-base-800 hover:text-white"
            title="Import a chat from an exported JSON file"
          >
            ⇪ Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importSessionFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={createSession}
            className="rounded-md bg-accent-500 px-2 py-1 text-xs font-medium hover:bg-accent-400"
          >
            + New
          </button>
        </div>
      </div>
      {importError && (
        <p className="mx-4 mb-2 rounded-md border border-red-800/60 bg-red-950/50 px-2 py-1 text-xs text-red-300">
          {importError}
        </p>
      )}
      <div className="px-2 pb-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chats…"
          aria-label="Search messages across chats"
          className="w-full rounded-lg border border-base-700 bg-base-800 px-3 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-accent-500"
        />
      </div>
      {searchHits !== null && (
        <div className="mx-2 mb-2 max-h-64 overflow-y-auto rounded-lg border border-base-700 bg-base-800/60">
          {searching ? (
            <p className="px-3 py-2 text-xs text-neutral-400">Searching…</p>
          ) : searchHits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-400">
              No messages match “{searchQuery.trim()}”.
            </p>
          ) : (
            searchHits.map((h) => (
              <button
                key={h.message_id}
                type="button"
                onClick={() => jumpToHit(h)}
                className="block w-full border-b border-base-700/60 px-3 py-2 text-left last:border-0 hover:bg-base-700/60"
              >
                <span className="block truncate text-xs font-medium text-white">
                  {h.session_title || "New chat"}
                  <span className="ml-1.5 font-normal text-neutral-500">
                    {h.role === "user" ? "you" : "assistant"}
                  </span>
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  {h.snippet}
                </span>
              </button>
            ))
          )}
        </div>
      )}
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
            <span className="min-w-0 flex-1">
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename(s.id);
                    else if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => saveRename(s.id)}
                  aria-label="Rename chat"
                  maxLength={120}
                  className="w-full rounded border border-accent-500 bg-base-800 px-1.5 py-0.5 text-sm text-white outline-none"
                />
              ) : (
                <>
                  <span className="block truncate">{s.title || "New chat"}</span>
                  <span className="block truncate text-[11px] text-neutral-500">
                    {new Date(s.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
            </span>
            <span className="ml-2 flex shrink-0 items-center">
              <button
                onClick={(e) => startRename(s, e)}
                className="rounded px-1.5 py-0.5 text-xs text-neutral-500 opacity-0 hover:bg-base-600 hover:text-white group-hover:opacity-100"
                aria-label="Rename chat"
                title="Rename chat"
              >
                ✎
              </button>
              <button
                onClick={(e) => exportSession(s.id, e)}
                className="rounded px-1.5 py-0.5 text-xs text-neutral-500 opacity-0 hover:bg-base-600 hover:text-white group-hover:opacity-100"
                aria-label="Export chat as JSON"
                title="Export chat as JSON"
              >
                ⤓
              </button>
              <button
                onClick={(e) => deleteSession(s.id, e)}
                className="rounded px-1.5 py-0.5 text-xs text-neutral-500 opacity-0 hover:bg-base-600 hover:text-white group-hover:opacity-100"
                aria-label="Delete chat"
                title="Delete chat"
              >
                ✕
              </button>
            </span>
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

  const keyless = status !== null && !status.gateway;
  const warnings: string[] = [];
  if (status && !status.gateway) {
    warnings.push(
      "Keyless mode — chatting via a free demo model. The live browser and terminal tools need OMNIROUTE_API_KEY (or OPENROUTER_API_KEY) to work."
    );
  }
  if (status && !status.database) {
    warnings.push(
      "Chats aren't saved — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for persistent history."
    );
  }

  return (
    <div className="flex h-screen flex-col bg-base-950 text-white">
      {warnings.length > 0 && (
        <div className="w-full shrink-0 border-b border-amber-800/60 bg-amber-950/50 px-4 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-200">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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
          <ChatPanel
            messages={messages}
            onSend={sendMessage}
            sending={sending}
            onRetry={retryLast}
            keyless={keyless}
            highlightId={highlightId}
            onDeleteMessage={deleteChatMessage}
            onEditResend={rewindAndResend}
            onRegenerate={regenerateReply}
          />
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
              <BrowserPane
                liveViewUrl={liveViewUrl}
                screenshotUrl={screenshotUrl}
                status={browserStatus}
              />
            ) : (
              <TerminalPane
                entries={terminalEntries}
                onClear={() => setTerminalEntries([])}
              />
            )}
          </div>
        </div>
      </main>
      </div>

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
