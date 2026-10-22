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

## Simple chat (`/chat`)

The sidebar's "💬 Simple chat" link opens a minimal dark-mode chatbot
page — message list, input box, model picker — for when you just want to
talk to a model without the agent shell. It reuses the same gateway as
the main app (OpenRouter unless `OMNIROUTE_BASE_URL` points elsewhere);
there is no separate provider and no keyless fallback on this page —
without a key it says so and stops.

- **Models**: the picker lists `OPENROUTER_MODELS` (comma-separated ids)
  when set, otherwise a curated list of open-weight models in
  `lib/omniroute.ts` (`DEFAULT_OPENROUTER_MODELS`), each verified against
  the live OpenRouter catalog. The choice persists in the browser.
- **Your own key**: the "🔑 API key" panel lets the owner paste an
  OpenRouter key. It is stored only in an httpOnly cookie in that browser
  (`/api/openrouter/key`), sent to the server with each chat request, and
  used for that browser's requests only — it overrides the server env key
  there. It is never stored server-side, never logged, and the UI only
  ever shows it masked (first 3 + last 4 chars). "Remove" forgets it.
- **Not saved**: conversations on this page live in the page only — a
  reload clears them. Use the main app for saved, searchable history.
- The PIN gate covers `/chat` like every other page when `APP_PIN` is
  set.

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

## Chat export / import

Every chat can leave the app as a portable JSON file and come back:

- **Export**: the ⤓ button on any chat in the sidebar downloads it
  (`GET /api/sessions/export?id=...`) — title, all messages, timestamps.
- **Import**: the ⇪ Import button reads an exported JSON file and
  recreates the chat (`POST /api/sessions/import`). Payloads are
  validated: max 2000 messages, unknown/invalid rows skipped, content
  capped so a hand-edited file can't blow up the database.

This is also the honest answer to the in-memory caveat above: without
Supabase, chats are transient, but you can export anything worth keeping
before the instance recycles.

## Chat management

Chats are editable, not append-only:

- **Rename**: the ✎ button on any chat in the sidebar renames it inline
  (`PATCH /api/sessions`), Enter saves, Esc cancels.
- **Edit & resend**: hover any of your messages, hit ✎ Edit, change the
  text, and "Save & resend" rewinds the stored chat to that message and
  sends the new text as a fresh turn.
- **Regenerate**: hover the latest assistant reply and hit ↻ to re-run
  the answer to your last message.
- **Delete message**: hover any message and hit Delete
  (`DELETE /api/messages?sessionId=…&messageId=…`); the server also
  supports `&truncateFrom=…` to delete a message and everything after
  it — that's what edit-and-resend and regenerate use under the hood.

## Message search

The sidebar search box searches across **all** chats
(`GET /api/search?q=...`), case-insensitive, newest matches first, with
a snippet around each match. Clicking a result opens that chat and
scrolls the message into view with a highlight flash. Backed by
Supabase `ilike` when configured, plain filtering in memory otherwise.

## Tests

`npm test` runs the vitest suite (`lib/*.test.ts` and
`app/api/**/*.test.ts`): PIN rate-limit windows/lockouts/re-lock, HMAC
gate-token properties, the in-memory store (round-trips, import, search,
snippets, message delete/truncate), the keyless chat path (system/tool
message folding, POST retries, GET fallback, honest failure), the
messages/sessions route handlers (delete, truncate, rename, validation),
and the simple-chat OpenRouter path (model-list parsing, key masking and
cookie handling, per-request key use, and the `/api/openrouter/*` route
handlers). 75 tests, all green.
