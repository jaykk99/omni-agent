# Omni Agent

A chat assistant with a real, live browser pane it can drive — inspired by
Meta AI's browsing feature. Built with Next.js 14 (App Router), Supabase auth
+ persistence, an OpenRouter-compatible gateway ("OmniRoute") for the model,
and Browserbase for the live browser view.

## Stack

- **UI**: Next.js 14, TypeScript, Tailwind
- **Auth + data**: Supabase (magic-link auth, `chat_sessions` / `chat_messages` tables, RLS)
- **Model gateway**: OpenRouter-compatible chat completions (`lib/omniroute.ts`) — point `OMNIROUTE_BASE_URL`/`OMNIROUTE_API_KEY` at a hosted OmniRoute instance later; defaults to OpenRouter
- **Live browser**: Browserbase — the assistant calls a `browser_action` tool (`goto` / `click` / `back` / `read`) which drives a real headless Chrome session over CDP via `playwright-core`; the same session's live view URL is embedded as an iframe in the UI

## Setup

1. `npm install`
2. Apply `supabase/schema.sql` to your Supabase project (SQL editor or `supabase db push`)
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY` (or `OMNIROUTE_API_KEY` + `OMNIROUTE_BASE_URL` for a self-hosted OmniRoute)
   - `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`
4. In Supabase Auth settings, add your deployed URL (and `http://localhost:3000`) to the redirect allow-list for the magic-link callback (`/auth/callback`).
5. `npm run dev`

## Deploying

Push to GitHub and import into Vercel, or `vercel deploy`. Set the same env
vars in the Vercel project settings (Production + Preview).
