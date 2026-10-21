import { describe, expect, it } from "vitest";
import { PATCH } from "./route";
import { getStore } from "@/lib/store";

// Route-level tests for PATCH /api/sessions (chat rename), running against
// the in-memory store (no Supabase env configured).

const base = "http://localhost/api/sessions";

function patchRequest(body: unknown) {
  return new Request(base, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/sessions", () => {
  it("renames a session and returns the new title", async () => {
    const session = await getStore().createSession("Before rename zxqv");
    const res = await PATCH(patchRequest({ id: session.id, title: "Renamed zxqv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.session.title).toBe("Renamed zxqv");
    expect((await getStore().getSession(session.id))?.title).toBe("Renamed zxqv");
  });

  it("400s on a missing or blank title", async () => {
    const session = await getStore().createSession("Blank title zxqv");
    expect(
      (await PATCH(patchRequest({ id: session.id }))).status
    ).toBe(400);
    expect(
      (await PATCH(patchRequest({ id: session.id, title: "   " }))).status
    ).toBe(400);
  });

  it("400s on an overlong title", async () => {
    const session = await getStore().createSession("Long title zxqv");
    const res = await PATCH(
      patchRequest({ id: session.id, title: "x".repeat(121) })
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown session", async () => {
    const res = await PATCH(
      patchRequest({ id: "no-such-session-zxqv", title: "Whatever" })
    );
    expect(res.status).toBe(404);
  });

  it("collapses whitespace in the stored title", async () => {
    const session = await getStore().createSession("Whitespace zxqv");
    await PATCH(
      patchRequest({ id: session.id, title: "  hello\n\n  world  zxqv " })
    );
    expect((await getStore().getSession(session.id))?.title).toBe(
      "hello world zxqv"
    );
  });
});
