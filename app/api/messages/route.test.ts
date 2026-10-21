import { describe, expect, it } from "vitest";
import { DELETE, GET } from "./route";
import { getStore } from "@/lib/store";

// Route-level tests for /api/messages, running against the in-memory store
// (no Supabase env configured). Each test builds its own session.

const base = "http://localhost/api/messages";

async function seedSession() {
  const store = getStore();
  const session = await store.createSession("Route test session zxqv");
  const first = await store.addMessage(session.id, "user", "first message zxqv");
  const second = await store.addMessage(
    session.id,
    "assistant",
    "second message zxqv"
  );
  const third = await store.addMessage(session.id, "user", "third message zxqv");
  return { session, first, second, third };
}

describe("GET /api/messages", () => {
  it("returns the session's messages in order", async () => {
    const { session, first, second, third } = await seedSession();
    const res = await GET(new Request(`${base}?sessionId=${session.id}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);
  });

  it("400s without a sessionId", async () => {
    const res = await GET(new Request(base));
    expect(res.status).toBe(400);
  });

  it("404s for an unknown session", async () => {
    const res = await GET(new Request(`${base}?sessionId=no-such-session-zxqv`));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/messages", () => {
  it("400s without sessionId or a message target", async () => {
    expect((await DELETE(new Request(base))).status).toBe(400);
    const { session } = await seedSession();
    const res = await DELETE(new Request(`${base}?sessionId=${session.id}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/messageId or truncateFrom/);
  });

  it("404s for an unknown session", async () => {
    const res = await DELETE(
      new Request(`${base}?sessionId=no-such-session-zxqv&messageId=whatever`)
    );
    expect(res.status).toBe(404);
  });

  it("deletes a single message by messageId", async () => {
    const { session, first, second, third } = await seedSession();
    const res = await DELETE(
      new Request(`${base}?sessionId=${session.id}&messageId=${second.id}`)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const remaining = await getStore().listMessages(session.id);
    expect(remaining.map((m) => m.id)).toEqual([first.id, third.id]);
  });

  it("truncates from truncateFrom onward", async () => {
    const { session, first, second } = await seedSession();
    const res = await DELETE(
      new Request(`${base}?sessionId=${session.id}&truncateFrom=${second.id}`)
    );
    expect(res.status).toBe(200);

    const remaining = await getStore().listMessages(session.id);
    expect(remaining.map((m) => m.id)).toEqual([first.id]);
  });

  it("404s when the truncate anchor does not exist", async () => {
    const { session } = await seedSession();
    const res = await DELETE(
      new Request(
        `${base}?sessionId=${session.id}&truncateFrom=no-such-message-zxqv`
      )
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Message not found");
  });
});
