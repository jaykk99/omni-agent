// Persistence abstraction: Supabase when it's configured, otherwise an
// in-memory store so the app still runs (and chats) with zero keys.
//
// KEYLESS-FIRST: nothing in the app may assume Supabase exists. Routes must
// call getStore() and never touch the Supabase client directly.
//
// Honest limits of the in-memory fallback: serverless functions don't share
// memory across instances, so without Supabase a chat can reset if a request
// lands on a cold instance. The UI says this plainly (see /api/status) —
// better a transient chat than a crash or a blank screen.

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

export type SessionRow = {
  id: string;
  title: string;
  created_at: string;
  vercel_sandbox_id?: string | null;
};

export type MessageRow = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
};

/** A portable export/import payload: one chat session with its messages. */
export type SessionExport = {
  version: 1;
  exported_at: string;
  title: string;
  messages: { role: string; content: string; created_at?: string }[];
};

/** One message match for cross-chat search. */
export type SearchHit = {
  session_id: string;
  session_title: string;
  message_id: string;
  role: string;
  snippet: string;
  created_at: string;
};

export interface Store {
  listSessions(): Promise<SessionRow[]>;
  getSession(id: string): Promise<SessionRow | null>;
  createSession(title: string): Promise<SessionRow>;
  deleteSession(id: string): Promise<void>;
  /** Rename a session (used to auto-title chats from their first message). */
  updateSessionTitle(id: string, title: string): Promise<void>;
  setSandboxId(id: string, sandboxId: string): Promise<void>;
  listMessages(sessionId: string): Promise<MessageRow[]>;
  addMessage(sessionId: string, role: string, content: string): Promise<MessageRow>;
  /** Delete one message by id. */
  deleteMessage(sessionId: string, messageId: string): Promise<void>;
  /** Delete a message and every message after it (powers edit-and-resend
   *  and regenerate: rewind the chat to a point, then continue from there). */
  truncateMessages(sessionId: string, fromMessageId: string): Promise<void>;
  /** Create a session and bulk-insert messages from an export payload. */
  importSession(title: string, messages: { role: string; content: string }[]): Promise<SessionRow>;
  /** Case-insensitive substring search over all message content. */
  searchMessages(query: string, limit: number): Promise<SearchHit[]>;
}

export function isDatabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function createSupabaseStore(): Store {
  // The app has no per-user accounts — a single shared PIN (checked in
  // middleware) gates the whole thing, and RLS is disabled on both tables
  // (see supabase/schema.sql), so the anon key already has full access.
  // No service-role key is needed.
  const client: SupabaseClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  return {
    async listSessions() {
      const { data, error } = await client
        .from("chat_sessions")
        .select("id, title, created_at, vercel_sandbox_id")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as SessionRow[];
    },
    async getSession(id) {
      const { data, error } = await client
        .from("chat_sessions")
        .select("id, title, created_at, vercel_sandbox_id")
        .eq("id", id)
        .single();
      if (error) return null;
      return data as SessionRow;
    },
    async createSession(title) {
      const { data, error } = await client
        .from("chat_sessions")
        .insert({ title })
        .select("id, title, created_at, vercel_sandbox_id")
        .single();
      if (error) throw new Error(error.message);
      return data as SessionRow;
    },
    async deleteSession(id) {
      const { error } = await client.from("chat_sessions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async updateSessionTitle(id, title) {
      const { error } = await client
        .from("chat_sessions")
        .update({ title })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    async setSandboxId(id, sandboxId) {
      const { error } = await client
        .from("chat_sessions")
        .update({ vercel_sandbox_id: sandboxId })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    async listMessages(sessionId) {
      const { data, error } = await client
        .from("chat_messages")
        .select("id, session_id, role, content, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data as MessageRow[];
    },
    async addMessage(sessionId, role, content) {
      const { data, error } = await client
        .from("chat_messages")
        .insert({ session_id: sessionId, role, content })
        .select("id, session_id, role, content, created_at")
        .single();
      if (error) throw new Error(error.message);
      return data as MessageRow;
    },
    async deleteMessage(sessionId, messageId) {
      const { error } = await client
        .from("chat_messages")
        .delete()
        .eq("id", messageId)
        .eq("session_id", sessionId);
      if (error) throw new Error(error.message);
    },
    async truncateMessages(sessionId, fromMessageId) {
      // Find the cutoff's timestamp, then delete it and everything newer.
      // (chat_messages has no sequence column; created_at is the order.)
      const { data: anchor, error: anchorError } = await client
        .from("chat_messages")
        .select("created_at")
        .eq("id", fromMessageId)
        .eq("session_id", sessionId)
        .single();
      if (anchorError || !anchor) {
        throw new Error("Message not found");
      }
      const { error } = await client
        .from("chat_messages")
        .delete()
        .eq("session_id", sessionId)
        .gte("created_at", anchor.created_at);
      if (error) throw new Error(error.message);
    },
    async importSession(title, messages) {
      const { data: session, error: sessionError } = await client
        .from("chat_sessions")
        .insert({ title })
        .select("id, title, created_at, vercel_sandbox_id")
        .single();
      if (sessionError) throw new Error(sessionError.message);
      if (messages.length > 0) {
        const { error: msgError } = await client.from("chat_messages").insert(
          messages.map((m) => ({
            session_id: session.id,
            role: m.role,
            content: m.content,
          }))
        );
        if (msgError) throw new Error(msgError.message);
      }
      return session as SessionRow;
    },
    async searchMessages(query, limit) {
      const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await client
        .from("chat_messages")
        .select("id, session_id, role, content, created_at")
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as MessageRow[];
      const titles = new Map<string, string>();
      if (rows.length > 0) {
        const ids = [...new Set(rows.map((r) => r.session_id))];
        const { data: sessionsData } = await client
          .from("chat_sessions")
          .select("id, title")
          .in("id", ids);
        for (const s of (sessionsData ?? []) as { id: string; title: string }[]) {
          titles.set(s.id, s.title);
        }
      }
      return rows.map((r) => ({
        session_id: r.session_id,
        session_title: titles.get(r.session_id) ?? "Untitled chat",
        message_id: r.id,
        role: r.role,
        snippet: makeSnippet(r.content, query),
        created_at: r.created_at,
      }));
    },
  };
}

function createMemoryStore(): Store {
  const sessions = new Map<string, SessionRow>();
  const messages = new Map<string, MessageRow[]>();
  const now = () => new Date().toISOString();

  return {
    async listSessions() {
      return [...sessions.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
    },
    async getSession(id) {
      return sessions.get(id) ?? null;
    },
    async createSession(title) {
      const session: SessionRow = {
        id: crypto.randomUUID(),
        title,
        created_at: now(),
        vercel_sandbox_id: null,
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return session;
    },
    async deleteSession(id) {
      sessions.delete(id);
      messages.delete(id);
    },
    async updateSessionTitle(id, title) {
      const s = sessions.get(id);
      if (s) s.title = title;
    },
    async setSandboxId(id, sandboxId) {
      const s = sessions.get(id);
      if (s) s.vercel_sandbox_id = sandboxId;
    },
    async listMessages(sessionId) {
      return messages.get(sessionId) ?? [];
    },
    async addMessage(sessionId, role, content) {
      const row: MessageRow = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role,
        content,
        created_at: now(),
      };
      const list = messages.get(sessionId) ?? [];
      list.push(row);
      messages.set(sessionId, list);
      return row;
    },
    async importSession(title, messageList) {
      const session = await this.createSession(title);
      for (const m of messageList) {
        await this.addMessage(session.id, m.role, m.content);
      }
      return session;
    },
    async deleteMessage(sessionId, messageId) {
      const list = messages.get(sessionId);
      if (list) {
        messages.set(
          sessionId,
          list.filter((m) => m.id !== messageId)
        );
      }
    },
    async truncateMessages(sessionId, fromMessageId) {
      const list = messages.get(sessionId);
      if (!list) return;
      const idx = list.findIndex((m) => m.id === fromMessageId);
      if (idx === -1) throw new Error("Message not found");
      messages.set(sessionId, list.slice(0, idx));
    },
    async searchMessages(query, limit) {
      const needle = query.toLowerCase();
      const hits: SearchHit[] = [];
      for (const [sessionId, list] of messages) {
        const session = sessions.get(sessionId);
        for (const m of list) {
          if (m.content.toLowerCase().includes(needle)) {
            hits.push({
              session_id: sessionId,
              session_title: session?.title ?? "Untitled chat",
              message_id: m.id,
              role: m.role,
              snippet: makeSnippet(m.content, query),
              created_at: m.created_at,
            });
          }
        }
      }
      return hits
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },
  };
}

/** Pull a context window around the first query match, with ellipses. */
export function makeSnippet(content: string, query: string, radius = 60): string {
  const flat = content.replace(/\s+/g, " ").trim();
  const idx = flat.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return flat.slice(0, radius * 2 + 3);
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + query.length + radius);
  const head = start > 0 ? "…" : "";
  const tail = end < flat.length ? "…" : "";
  return head + flat.slice(start, end) + tail;
}

let memoryStore: Store | null = null;

export function getStore(): Store {
  if (isDatabaseConfigured()) return createSupabaseStore();
  if (!memoryStore) memoryStore = createMemoryStore();
  return memoryStore;
}
