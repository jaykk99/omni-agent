import { describe, expect, it } from "vitest";
import { getStore, makeSnippet } from "./store";

// These tests run against the in-memory store (no Supabase env configured).
// Each test uses unique needles so the shared singleton can't cross-talk.

describe("memory store sessions and messages", () => {
  it("round-trips a session with messages in order", async () => {
    const store = getStore();
    const session = await store.createSession("Store roundtrip test");
    await store.addMessage(session.id, "user", "hello there");
    await store.addMessage(session.id, "assistant", "hi back");

    const fetched = await store.getSession(session.id);
    expect(fetched?.title).toBe("Store roundtrip test");

    const messages = await store.listMessages(session.id);
    expect(messages.map((m) => m.content)).toEqual(["hello there", "hi back"]);
  });

  it("renames a session", async () => {
    const store = getStore();
    const session = await store.createSession("Old title");
    await store.updateSessionTitle(session.id, "New title");
    expect((await store.getSession(session.id))?.title).toBe("New title");
  });
});

describe("importSession", () => {
  it("creates a session and inserts every message", async () => {
    const store = getStore();
    const session = await store.importSession("Imported zxqv", [
      { role: "user", content: "first imported" },
      { role: "assistant", content: "second imported" },
      { role: "user", content: "third imported" },
    ]);
    const messages = await store.listMessages(session.id);
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toBe("third imported");
    expect((await store.getSession(session.id))?.title).toBe("Imported zxqv");
  });

  it("handles an empty message list", async () => {
    const store = getStore();
    const session = await store.importSession("Empty import zxqv", []);
    expect(await store.listMessages(session.id)).toHaveLength(0);
  });
});

describe("searchMessages", () => {
  it("finds matches case-insensitively with a contextual snippet", async () => {
    const store = getStore();
    const needle = "xylophone-quasar-search";
    const session = await store.createSession("Search target zxqv");
    await store.addMessage(
      session.id,
      "user",
      `some filler words before the ${needle} and some filler words after it`
    );

    const hits = await store.searchMessages(needle.toUpperCase(), 10);
    const mine = hits.find((h) => h.session_id === session.id);
    expect(mine).toBeDefined();
    expect(mine!.snippet).toContain(needle);
    expect(mine!.session_title).toBe("Search target zxqv");
    expect(mine!.role).toBe("user");
  });

  it("respects the result limit", async () => {
    const store = getStore();
    const needle = "limit-cap-needle-zxqv";
    const session = await store.createSession("Limit session zxqv");
    for (let i = 0; i < 5; i++) {
      await store.addMessage(session.id, "user", `message ${i} ${needle}`);
    }
    const hits = await store.searchMessages(needle, 3);
    expect(hits.filter((h) => h.snippet.includes(needle))).toHaveLength(3);
  });

  it("returns nothing for an unmatched query", async () => {
    const store = getStore();
    expect(
      await store.searchMessages("no-such-needle-anywhere-zxqv-123", 10)
    ).toHaveLength(0);
  });
});

describe("makeSnippet", () => {
  it("adds ellipses around a mid-text match", () => {
    const content = "a".repeat(100) + " TARGET " + "b".repeat(100);
    const snippet = makeSnippet(content, "TARGET", 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("TARGET");
    expect(snippet.length).toBeLessThan(content.length);
  });

  it("skips the leading ellipsis when the match is at the start", () => {
    const snippet = makeSnippet("TARGET " + "c".repeat(200), "TARGET", 10);
    expect(snippet.startsWith("…")).toBe(false);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("collapses whitespace in the snippet", () => {
    const snippet = makeSnippet("hello\n\n   world TARGET", "TARGET", 20);
    expect(snippet).not.toContain("\n");
    expect(snippet).toContain("TARGET");
  });
});
