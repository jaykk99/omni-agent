// Drives a real headless Chromium that lives INSIDE the same persistent
// Vercel Sandbox already used for the terminal feature (see lib/sandbox.ts),
// instead of a separate paid remote browser service (Browserbase — see
// lib/browser.ts, kept in place but no longer called by the chat route).
// This sidesteps Browserbase's free-tier minute limit entirely: no external
// session cap, no per-minute billing, and it reuses infrastructure this app
// already provisions per chat session (chat_sessions.vercel_sandbox_id).
//
// A small Node HTTP server (written into the sandbox on first use) holds ONE
// Chromium + page in memory and keeps running as a detached background
// process across separate /api/chat invocations, the same way packages
// installed into the sandbox already persist for the terminal tool. Each
// browser action is dispatched to it as a local loopback request (nothing
// needs to be reachable from outside the sandbox), and the resulting
// screenshot is pulled out afterward with sandbox.readFileToBuffer() so the
// chat UI's browser pane has something real to show — a still image that
// refreshes after every action, not a video feed, but genuine and live
// rather than an iframe into a third party's remote session.

import type { Sandbox } from "@vercel/sandbox";

const SERVER_DIR = "/tmp/omni-browser";
const SERVER_PORT = 4123;
const SCREENSHOT_PATH = `${SERVER_DIR}/shot.jpg`;
const ACTION_PATH = `${SERVER_DIR}/action.json`;

// Runs inside the sandbox under plain Node (runtime is node22/node24, so
// global fetch is available — no curl dependency needed).
const SERVER_SCRIPT = `
const http = require('http');
const { chromium: pwChromium } = require('playwright-core');
// @sparticuz/chromium is ESM-only ("type":"module") — Node's require(esm)
// interop hands back the module namespace object here, with the real API
// under .default, rather than throwing.
const chromiumModule = require('@sparticuz/chromium');
const chromium = chromiumModule.default || chromiumModule;

let pagePromise = null;
async function getPage() {
  if (!pagePromise) {
    pagePromise = (async () => {
      // The sandbox image has no apt/yum, so a normal "npx playwright install"
      // (which shells out to a system package manager for shared libs) fails.
      // @sparticuz/chromium ships a statically-linked Chromium build made
      // exactly for restricted serverless environments like this one — no
      // system package manager needed at all.
      const executablePath = await chromium.executablePath();
      const browser = await pwChromium.launch({
        executablePath,
        args: chromium.args,
        headless: true,
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      return await context.newPage();
    })();
  }
  return pagePromise;
}

async function shot(page) {
  try {
    await page.screenshot({ path: '${SCREENSHOT_PATH}', type: 'jpeg', quality: 55 });
  } catch (e) {
    // Best effort — a mid-navigation screenshot failure shouldn't fail the action itself.
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/action') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { action, value } = JSON.parse(body || '{}');
        const page = await getPage();
        if (action === 'goto' && value) {
          await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else if (action === 'click' && value) {
          await page.getByText(value, { exact: false }).first().click({ timeout: 10000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        } else if (action === 'back') {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        }
        await shot(page);
        const title = await page.title();
        const url = page.url();
        const text = await page.evaluate(() => ((document.body && document.body.innerText) || '').slice(0, 6000));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url, title, text }));
      } catch (err) {
        try {
          const page = await getPage();
          await shot(page);
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String((err && err.message) || err) }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(${SERVER_PORT}, '127.0.0.1', () => {
  console.log('omni-browser server listening on ${SERVER_PORT}');
});
`;

async function nodeFetch(sandbox: Sandbox, script: string): Promise<string> {
  const result = await sandbox.runCommand({
    cmd: "node",
    args: ["-e", script],
  });
  return (await result.stdout()).trim();
}

async function isServerUp(sandbox: Sandbox): Promise<boolean> {
  const code = await nodeFetch(
    sandbox,
    `fetch('http://127.0.0.1:${SERVER_PORT}/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.stdout.write(String(r.status))).catch(()=>process.stdout.write('0'))`
  );
  return code === "200";
}

async function ensureServer(sandbox: Sandbox): Promise<void> {
  if (await isServerUp(sandbox)) return;

  await sandbox.mkDir(SERVER_DIR).catch(() => {});
  await sandbox.writeFiles([
    { path: `${SERVER_DIR}/server.js`, content: Buffer.from(SERVER_SCRIPT, "utf-8") },
  ]);

  // This is the one-time slow part of a fresh sandbox (downloading a ~50MB
  // pre-built Chromium, no system package manager involved), not something
  // paid on every action — the server then stays up for the sandbox's whole
  // life.
  const install = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      `cd ${SERVER_DIR} && npm init -y >/tmp/omni-browser-install.log 2>&1 && ` +
        `npm install playwright-core@1.49.0 @sparticuz/chromium@153.0.0 >>/tmp/omni-browser-install.log 2>&1`,
    ],
  });

  if (install.exitCode !== 0) {
    const log = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", "tail -c 3000 /tmp/omni-browser-install.log 2>/dev/null || true"],
    });
    throw new Error(`Failed to set up the sandbox browser: ${(await log.stdout()).trim().slice(0, 1500)}`);
  }

  await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `cd ${SERVER_DIR} && nohup node server.js > server.log 2>&1 & disown`],
    detached: true,
  });

  // Give the server a moment to come up, retrying rather than assuming a
  // fixed delay is always enough on a cold sandbox.
  for (let i = 0; i < 20; i++) {
    if (await isServerUp(sandbox)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Sandbox browser server did not come up in time.");
}

export type SandboxBrowserResult = {
  url: string;
  title: string;
  text: string;
  screenshotDataUrl: string | null;
  error?: string;
};

export async function runBrowserActionInSandbox(
  sandbox: Sandbox,
  action: "goto" | "click" | "read" | "back",
  value?: string
): Promise<SandboxBrowserResult> {
  await ensureServer(sandbox);

  // Pass the action payload through a temp file rather than shell/JS string
  // interpolation — sidesteps every quoting hazard for arbitrary tool
  // arguments (click text, URLs with special characters, etc).
  await sandbox.writeFiles([
    { path: ACTION_PATH, content: Buffer.from(JSON.stringify({ action, value: value ?? "" }), "utf-8") },
  ]);

  const raw = await nodeFetch(
    sandbox,
    `const fs=require('fs');fetch('http://127.0.0.1:${SERVER_PORT}/action',{method:'POST',headers:{'Content-Type':'application/json'},body:fs.readFileSync('${ACTION_PATH}'),signal:AbortSignal.timeout(40000)}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>process.stdout.write(JSON.stringify({error:String((e&&e.message)||e)})))`
  );

  let parsed: { url?: string; title?: string; text?: string; error?: string } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { error: raw.slice(0, 500) || "Sandbox browser returned no output." };
  }

  let screenshotDataUrl: string | null = null;
  try {
    const buf = await sandbox.readFileToBuffer({ path: SCREENSHOT_PATH });
    if (buf) screenshotDataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    // No screenshot yet (e.g. the very first action failed before one was taken).
  }

  return {
    url: parsed.url ?? "",
    title: parsed.title ?? "",
    text: parsed.text ?? "",
    screenshotDataUrl,
    error: parsed.error,
  };
}
