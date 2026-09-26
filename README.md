# Omni Agent

A chat assistant with a real, live browser pane and a real terminal it can
drive — inspired by Meta AI's browsing feature. Built with Next.js 14 (App
Router), Supabase for persistence, an OpenRouter-compatible gateway
("OmniRoute") for the model, Browserbase for the live browser view, and
Vercel Sandbox for the terminal. The whole app sits behind a single shared
PIN (`APP_PIN`) — there's no per-user login.

## Stack

- **UI**: Next.js 14, TypeScript, Tailwind
- **Access**: a PIN gate in middleware (`APP_PIN`) — no accounts, no email sign-in
- **Data**: Supabase (`chat_sessions` / `chat_messages` tables), read/written via the service-role key from API routes only
- **Model gateway**: OpenRouter-compatible chat completions (`lib/omniroute.ts`) — point `OMNIROUTE_BASE_URL`/`OMNIROUTE_API_KEY` at a hosted OmniRoute instance later; defaults to OpenRouter
- **Live browser**: Browserbase — the assistant calls a `browser_action` tool (`goto` / `click` / `back` / `read`) which drives a real headless Chrome session over CDP via `playwright-core`; the same session's live view URL is embedded as an iframe in the UI
- **Terminal**: Vercel Sandbox — the assistant calls a `terminal_action` tool to run shell commands (install packages, run scripts, etc.) in a persistent sandbox scoped to the chat session

## Setup

1. `npm install`
2. Apply `supabase/schema.sql` to your Supabase project (SQL editor or `supabase db push`)
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_PIN` (the shared PIN that gates the whole app)
   - `OPENROUTER_API_KEY` (or `OMNIROUTE_API_KEY` + `OMNIROUTE_BASE_URL` for a self-hosted OmniRoute)
   - `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`
4. `npm run dev`

## Deploying

Push to GitHub and import into Vercel, or `vercel deploy`. Set the same env
vars in the Vercel project settings (Production + Preview). Vercel Sandbox
authenticates automatically via the project's OIDC token when deployed on
Vercel — no extra token needed.
