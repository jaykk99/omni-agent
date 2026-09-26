// Wraps Browserbase (remote headless Chrome) so the assistant gets a real,
// live-viewable browser instead of a static fetch. Reuses the same
// BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID pattern already used by the
// error-inbox project.

const BB_API = "https://api.browserbase.com/v1";

type BrowserbaseSession = {
  id: string;
  connectUrl: string;
};

export async function createBrowserSession(): Promise<{
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
}> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error(
      "Browserbase is not configured (BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID)."
    );
  }

  const res = await fetch(`${BB_API}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!res.ok) {
    throw new Error(`Browserbase session create failed: ${await res.text()}`);
  }

  const session = (await res.json()) as BrowserbaseSession;

  const liveRes = await fetch(
    `${BB_API}/sessions/${session.id}/debug`,
    { headers: { "X-BB-API-Key": apiKey } }
  );
  const live = liveRes.ok
    ? ((await liveRes.json()) as { debuggerFullscreenUrl?: string })
    : {};

  return {
    sessionId: session.id,
    connectUrl: session.connectUrl,
    liveViewUrl: live.debuggerFullscreenUrl ?? "",
  };
}

export async function endBrowserSession(sessionId: string) {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) return;
  await fetch(`${BB_API}/sessions/${sessionId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({ status: "REQUEST_RELEASE" }),
  }).catch(() => {});
}

export type BrowserActionResult = {
  url: string;
  title: string;
  text: string;
};

// Connects to the live Browserbase session over CDP and performs one step.
// Kept to a small, safe action set so the model can't do anything arbitrary.
export async function runBrowserAction(
  connectUrl: string,
  action: "goto" | "click" | "read" | "back",
  value?: string
): Promise<BrowserActionResult> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    if (action === "goto" && value) {
      await page.goto(value, { waitUntil: "domcontentloaded", timeout: 30000 });
    } else if (action === "click" && value) {
      await page
        .getByText(value, { exact: false })
        .first()
        .click({ timeout: 10000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    } else if (action === "back") {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
    }

    const title = await page.title();
    const url = page.url();
    const text = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      return body.slice(0, 6000);
    });

    return { url, title, text };
  } finally {
    await browser.close();
  }
}
