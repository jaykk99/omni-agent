# Omni Agent

A chat assistant with a real browser pane it can drive and a real terminal
it can run — inspired by Meta AI's browsing feature. Built with Next.js 14
(App Router) and TypeScript.

## Keyless mode (the default)

The app boots with **zero env vars set** and stays useful:

- **Chat works** via a free, no-signup model (Pollinations' anonymous tier,
  best-effort — that tier is rate/budget-limited and flaps; the app retries
  and says plainly if it's unreachable). It's plain chat — no tool use.
- **No crashes, no blank screens.** Anything unavailable gets a clear
  in-app banner / inline notice instead of an error page.
- **No Browserbase needed.** The live browser is a real Chromium running
  *inside* the per-chat Vercel Sandbox (see `lib/browser-sandbox.ts`) —
  the assistant drives it with `goto` / `click` / `back` / `read`, and the
  pane shows a screenshot that refreshes after every action.
- **No PIN required.** Set `APP_PIN` if you want the gate; without it the
  app just opens.
- **No Supabase required.** Without it chats live in server memory — they
  work, but can reset when the serverless instance recycles. The UI says
  this plainly.

Add keys only for the features you want:

| Env vars | Unlocks |
|---|---|
| `OMNIROUTE_API_KEY` or `OPENROUTER_API_KEY` (+ optional `OMNIROUTE_BASE_URL`, `OMNIROUTE_MODEL`) | Full agent: the model gets `browser_action` + `terminal_action` tools |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Persistent chat history (`supabase/schema.sql`; RLS disabled, anon key is enough) |
| `APP_PIN` | PIN gate in front of the whole app |

## Stack

- **UI**: Next.js 14, TypeScript, Tailwind
- **Model gateway**: OpenAI/OpenRouter-compatible chat completions
  (`lib/omniroute.ts`). UI tier names `fast`/`strong` are auto-mapped to
  real model ids when the gateway is plain OpenRouter.
- **Persistence**: `lib/store.ts` — Supabase when configured, in-memory
  otherwise.
- **Browser + terminal**: one Vercel Sandbox per chat session
  (`lib/sandbox.ts`, `lib/browser-sandbox.ts`). On Vercel the SDK
  authenticates via the project's OIDC token — no token needed.

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in only what you want (nothing is required)
3. If you want saved history: apply `supabase/schema.sql` to your Supabase project
4. `npm run dev`

## Deploying

Push to GitHub and import into Vercel, or `vercel deploy`. Set whichever
env vars you want in the Vercel project settings (Production + Preview) —
the build and the app work fine with none of them set. Vercel Sandbox
authenticates automatically via the project's OIDC token when deployed on
Vercel.

## Why the app was "inert" before (fixed)

- Browserbase was wired as the browser path and required paid keys — now
  the default is a Chromium inside the already-provisioned Vercel Sandbox,
  so browsing needs no key at all (it does need a model key to *drive*
  it; without one the UI says so).
- The model gateway threw when no key was set — now it falls back to a
  free keyless model, and falls back again if the configured gateway
  errors.
- Supabase threw when unconfigured — now chats run in memory with a clear
  "not saved" banner.
- `APP_PIN` gated the app with no way to opt out — now the gate only
  exists when the var is set.

## PIN gate hardening

- Wrong-PIN attempts are rate-limited per client IP: 10 failures in
  10 minutes triggers a 15-minute lockout (HTTP 429 with `Retry-After`).
  The limit is per server instance (in-memory) — fine for a casual gate,
  not a vault.
- The gate cookie carries an HMAC digest of the PIN, never the PIN
  itself. After this change, anyone holding an old raw-PIN cookie is
  bounced to `/gate` once and re-enters.
