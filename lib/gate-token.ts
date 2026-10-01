// HMAC-based gate token: the PIN cookie stores a keyed digest instead of the
// raw PIN, so the PIN itself never sits in a cookie value. Uses WebCrypto so it
// runs in both the Edge middleware and Node API routes.

const GATE_CONTEXT = "omni-gate-v1";

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function gateTokenFor(pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`omni-gate|${pin}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(GATE_CONTEXT)
  );
  return toHex(new Uint8Array(sig));
}

/** The cookie value a successful PIN entry should carry, or null when no PIN
 *  gate is configured (middleware skips the gate entirely then). */
export async function expectedGateToken(): Promise<string | null> {
  const pin = process.env.APP_PIN;
  if (!pin) return null;
  return gateTokenFor(pin);
}
