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

export interface Store {
  listSessions(): Promise<SessionRow[]>;
  getSession(id: string): Promise<SessionRow | null>;
  createSession(title: string): Promise<SessionRow>;
  deleteSession(id: string): Promise<void>;
  setSandboxId(id: string, sandboxId: string): Promise<void>;
  listMessages(sessionId: string): Promise<MessageRow[]>;
  addMessage(sessionId: string, role: string, content: string): Promise<MessageRow>;
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
  };
}

let memoryStore: Store | null = null;

export function getStore(): Store {
  if (isDatabaseConfigured()) return createSupabaseStore();
  if (!memoryStore) memoryStore = createMemoryStore();
  return memoryStore;
}
