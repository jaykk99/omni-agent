// Best-effort in-memory PIN attempt limiter for /api/gate.
//
// Honest limits: serverless instances don't share memory, so this throttles
// per warm instance — it still kills naive brute force from one client, and
// the PIN is a casual gate (not a vault), so per-instance limiting plus the
// lockout is the right weight. If brute-force resistance ever needs to be
// airtight, this must move to a shared store (Supabase/Upstash).

const WINDOW_MS = 10 * 60 * 1000; // sliding window for counting failures
const MAX_ATTEMPTS = 10; // failures inside the window before lockout
const LOCKOUT_MS = 15 * 60 * 1000; // lockout duration

type AttemptRecord = { failures: number[]; lockedUntil: number };

const attempts = new Map<string, AttemptRecord>();

export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function gateCheck(ip: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const rec = attempts.get(ip);
  if (rec && rec.lockedUntil > Date.now()) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function gateRecordFailure(ip: string): {
  locked: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  let rec = attempts.get(ip);
  if (!rec) {
    rec = { failures: [], lockedUntil: 0 };
    attempts.set(ip, rec);
  }
  rec.failures = rec.failures.filter((t) => now - t < WINDOW_MS);
  rec.failures.push(now);
  if (rec.failures.length >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
    rec.failures = [];
    return { locked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function gateClear(ip: string): void {
  attempts.delete(ip);
}
