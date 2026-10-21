import { describe, expect, it, afterEach } from "vitest";
import { expectedGateToken, gateTokenFor } from "./gate-token";

const PIN_ENV = "APP_PIN";
const savedPin = process.env[PIN_ENV];

afterEach(() => {
  if (savedPin === undefined) delete process.env[PIN_ENV];
  else process.env[PIN_ENV] = savedPin;
});

describe("gateTokenFor", () => {
  it("is deterministic for the same PIN", async () => {
    expect(await gateTokenFor("1234")).toBe(await gateTokenFor("1234"));
  });

  it("differs for different PINs", async () => {
    expect(await gateTokenFor("1234")).not.toBe(await gateTokenFor("5678"));
  });

  it("returns a 64-char lowercase hex digest (SHA-256, never the PIN)", async () => {
    const token = await gateTokenFor("secret-pin");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain("secret-pin");
  });
});

describe("expectedGateToken", () => {
  it("returns null when no APP_PIN is configured", async () => {
    delete process.env[PIN_ENV];
    expect(await expectedGateToken()).toBeNull();
  });

  it("matches gateTokenFor of the configured PIN", async () => {
    process.env[PIN_ENV] = "test-pin-999";
    const expected = await gateTokenFor("test-pin-999");
    expect(await expectedGateToken()).toBe(expected);
  });
});
