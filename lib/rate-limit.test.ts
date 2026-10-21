import { describe, expect, it, vi, afterEach } from "vitest";
import {
  clientIp,
  gateCheck,
  gateClear,
  gateRecordFailure,
} from "./rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("gateCheck", () => {
  it("allows an IP with no record", () => {
    const { allowed, retryAfterSec } = gateCheck("10.0.0.1");
    expect(allowed).toBe(true);
    expect(retryAfterSec).toBe(0);
  });

  it("allows an IP cleared after failures", () => {
    const ip = "10.0.0.2";
    gateRecordFailure(ip);
    gateRecordFailure(ip);
    gateClear(ip);
    expect(gateCheck(ip).allowed).toBe(true);
  });
});

describe("gateRecordFailure lockout", () => {
  it("does not lock before 10 failures in the window", () => {
    const ip = "10.0.1.1";
    let result = { locked: false, retryAfterSec: 0 };
    for (let i = 0; i < 9; i++) {
      result = gateRecordFailure(ip);
    }
    expect(result.locked).toBe(false);
    expect(gateCheck(ip).allowed).toBe(true);
  });

  it("locks on the 10th failure with a 15-minute Retry-After", () => {
    const ip = "10.0.1.2";
    let result = { locked: false, retryAfterSec: 0 };
    for (let i = 0; i < 10; i++) {
      result = gateRecordFailure(ip);
    }
    expect(result.locked).toBe(true);
    expect(result.retryAfterSec).toBe(15 * 60);

    const check = gateCheck(ip);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterSec).toBeGreaterThan(0);
    expect(check.retryAfterSec).toBeLessThanOrEqual(15 * 60);
  });

  it("clears the failure count when the lockout engages", () => {
    const ip = "10.0.1.3";
    for (let i = 0; i < 10; i++) gateRecordFailure(ip);
    // Lockout expires -> the stale record must not instantly re-lock on
    // one new failure, because the counter was reset at lockout time.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(gateCheck(ip).allowed).toBe(true);
    const result = gateRecordFailure(ip);
    expect(result.locked).toBe(false);
  });

  it("forgets failures older than the 10-minute window", () => {
    const ip = "10.0.1.4";
    vi.useFakeTimers();
    for (let i = 0; i < 9; i++) gateRecordFailure(ip);
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    const result = gateRecordFailure(ip);
    expect(result.locked).toBe(false);
    expect(gateCheck(ip).allowed).toBe(true);
  });

  it("re-locks if failures continue after the lockout expires", () => {
    const ip = "10.0.1.5";
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) gateRecordFailure(ip);
    expect(gateCheck(ip).allowed).toBe(false);
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    let result = { locked: false, retryAfterSec: 0 };
    for (let i = 0; i < 10; i++) {
      result = gateRecordFailure(ip);
    }
    expect(result.locked).toBe(true);
    expect(gateCheck(ip).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://x/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(clientIp(req)).toBe("9.9.9.9");
  });

  it("returns unknown when no IP headers exist", () => {
    expect(clientIp(new Request("http://x/"))).toBe("unknown");
  });
});
