import { spawn } from "node:child_process";

export interface RunCommandOptions {
  cwd: string;
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

export async function runCommand(command: string, options: RunCommandOptions): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;

    const append = (current: Buffer, chunk: Buffer): Buffer => {
      const next = Buffer.concat([current, chunk]);
      if (next.byteLength <= options.maxOutputBytes) return next;
      truncated = true;
      return next.subarray(0, options.maxOutputBytes);
    };

    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", reject);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs);

    const onAbort = () => child.kill("SIGTERM");
    options.signal.addEventListener("abort", onAbort, { once: true });

    child.on("close", (exitCode: number | null) => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      if (options.signal.aborted) {
        reject(options.signal.reason ?? new Error("Command aborted"));
        return;
      }
      resolve({
        exitCode,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        truncated
      });
    });
  });
}
