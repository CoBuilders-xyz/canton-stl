import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export type Sandbox = {
  readonly jsonApiUrl: string;
  readonly ledgerApiPort: number;
  readonly adminApiPort: number;
  readonly jsonApiPort: number;
  readonly portFile: string;
};

export type SandboxSession = Sandbox & {
  /** Includes startup, DAR upload, and readiness checks; excludes application setup. */
  readonly startupMs: number;
  /** Idempotent. Stops the owned process group, including a surviving JVM. */
  stop(): Promise<void>;
};

export type SandboxOptions = {
  command?: string;
  readyTimeoutMs?: number;
  dars?: readonly string[];
  /** Must already be installed through DPM. This PoC is verified on 3.5.6. */
  cantonVersion?: string;
};

/** Use from a framework's before/after hooks. Await stop() even when assertions fail. */
export async function startSandbox(options: SandboxOptions = {}): Promise<SandboxSession> {
  if (process.platform === "win32") throw new Error("This PoC supports POSIX process groups (macOS/Linux).");
  const timeout = options.readyTimeoutMs ?? 120_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("readyTimeoutMs must be positive");
  const version = options.cantonVersion ?? "3.5.6";
  if (!/^[A-Za-z0-9._-]+$/.test(version)) throw new Error("Invalid Canton component version");
  const dars = (options.dars ?? []).map((dar) => path.resolve(dar));
  for (const dar of dars) await access(dar);

  const started = performance.now();
  const runDir = await mkdtemp(path.join(tmpdir(), "stl-"));
  let child: ChildProcess | undefined;
  let closed = false;
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    if (child) await stopOwnedProcess(child, () => closed);
    await rm(runDir, { recursive: true, force: true });
  })();
  let output = "";

  try {
    // The temporary directory must not silently select the user's default SDK.
    await writeFile(path.join(runDir, "daml.yaml"), `components:\n  - canton-open-source:${version}\n`);
    const ports = await allocatePorts();
    const sandbox: Sandbox = {
      jsonApiUrl: `http://127.0.0.1:${ports[3]}`,
      ledgerApiPort: ports[0]!, adminApiPort: ports[1]!, jsonApiPort: ports[3]!,
      portFile: path.join(runDir, "canton.ports"),
    };
    child = spawn(options.command ?? "dpm", [
      "sandbox", ...dars.flatMap((dar) => ["--dar", dar]),
      "--ledger-api-port", String(ports[0]), "--admin-api-port", String(ports[1]),
      "--sequencer-public-port", String(ports[2]), "--json-api-port", String(ports[3]),
      "--sequencer-admin-port", String(ports[4]), "--mediator-admin-port", String(ports[5]),
      "--canton-port-file", sandbox.portFile,
      "--log-file-name", path.join(runDir, "canton.log"),
      "--log-file-appender", "flat", "--log-level-stdout", "ERROR",
    ], { cwd: runDir, detached: true, stdio: ["ignore", "pipe", "pipe"] });

    let spawnError: Error | undefined;
    // close waits for inherited stdout/stderr to close as well as the launcher exit.
    child.once("close", () => { closed = true; });
    child.on("error", (error) => { spawnError = error; });
    const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-16_384); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const deadline = performance.now() + timeout;
    let ready = false;
    while (performance.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`dpm sandbox exited before readiness (${child.exitCode ?? child.signalCode})`);
      }
      const portsReady = await readFile(sandbox.portFile, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
      if (portsReady.trim() && await jsonApiAnswers(sandbox.jsonApiUrl, Math.max(1, Math.min(1000, deadline - performance.now())))) {
        ready = true;
        break;
      }
      await delay(Math.min(100, Math.max(0, deadline - performance.now())));
    }
    if (!ready) throw new Error(`Sandbox was not ready within ${timeout}ms`);
    return Object.freeze({ ...sandbox, startupMs: performance.now() - started, stop });
  } catch (error) {
    try { await stop(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Sandbox startup and cleanup failed"); }
    if (error instanceof Error && output.trim()) error.message += `\n${output.trim()}`;
    throw error;
  }
}

/** Framework-independent resource scope; callback failures still release the Sandbox. */
export async function withSandbox<T>(use: (sandbox: SandboxSession) => Promise<T>, options?: SandboxOptions): Promise<T> {
  const sandbox = await startSandbox(options);
  try { return await use(sandbox); }
  finally { await sandbox.stop(); }
}

async function allocatePorts(): Promise<number[]> {
  // Reserve all six simultaneously so we cannot select the same port twice.
  // They must be released before Canton binds; a competing bind then fails startup.
  const servers: net.Server[] = [];
  try {
    const ports: number[] = [];
    for (let i = 0; i < 6; i++) {
      const server = net.createServer();
      servers.push(server);
      ports.push(await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") reject(new Error("No allocated port"));
          else resolve(address.port);
        });
      }));
    }
    return ports;
  } finally {
    await Promise.all(servers.filter((s) => s.listening).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  }
}

async function jsonApiAnswers(url: string, timeout: number): Promise<boolean> {
  try {
    const response = await fetch(`${url}/v2/version`, { signal: AbortSignal.timeout(Math.ceil(timeout)) });
    const body = await response.json() as { version?: unknown };
    return response.ok && typeof body.version === "string";
  } catch { return false; }
}

async function stopOwnedProcess(child: ChildProcess, isClosed: () => boolean): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  // Do not return just because dpm exited: its JVM may still own the group.
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (isClosed()) return;
    try { process.kill(-pid, signal); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH" || isClosed()) return;
      throw error;
    }
    const deadline = performance.now() + 5_000;
    while (!isClosed() && performance.now() < deadline) await delay(50);
    if (isClosed()) return;
  }
  throw new Error(`Owned process group ${pid} did not stop`);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
