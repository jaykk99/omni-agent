-- Omni Agent schema: chat sessions + messages.
-- No per-user auth — the whole app sits behind a single shared PIN
-- (checked in middleware). RLS is disabled: the anon key already has
-- full table grants (Supabase's default), so API routes just use that.

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  browserbase_session_id text,
  browserbase_connect_url text,
  vercel_sandbox_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on public.chat_messages (session_id, created_at);
create index if not exists chat_sessions_created_at_idx on public.chat_sessions (created_at desc);
