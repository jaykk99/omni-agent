// Wraps Vercel Sandbox so the assistant gets a real, ephemeral Linux VM it
// can run shell commands in and install packages into. When this app is
// running on Vercel, the SDK authenticates automatically via the project's
// OIDC token — no separate API key needed. One sandbox is kept alive per
// chat session (see chat_sessions.vercel_sandbox_id) until it expires.

import { Sandbox } from "@vercel/sandbox";

const DEFAULT_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS ?? 10 * 60 * 1000); // 10 min

export type TerminalResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function getOrCreateSandbox(existingId?: string | null): Promise<{
  sandbox: Sandbox;
  sandboxId: string;
  created: boolean;
}> {
  if (existingId) {
    try {
      const sandbox = await Sandbox.get({ sandboxId: existingId });
      return { sandbox, sandboxId: existingId, created: false };
    } catch {
      // Sandbox expired or was reclaimed — fall through and create a new one.
    }
  }

  const sandbox = await Sandbox.create({
    timeout: DEFAULT_TIMEOUT_MS,
    resources: { vcpus: 2 },
  });

  return { sandbox, sandboxId: sandbox.sandboxId, created: true };
}

export async function runInSandbox(
  sandbox: Sandbox,
  command: string
): Promise<TerminalResult> {
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
  });

  const [stdout, stderr] = await Promise.all([
    result.stdout(),
    result.stderr(),
  ]);

  return {
    command,
    exitCode: result.exitCode,
    stdout: stdout.slice(0, 8000),
    stderr: stderr.slice(0, 4000),
  };
}
