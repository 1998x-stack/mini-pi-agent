import type { Tool } from "../core/tool.js";
import { runCommand } from "../utils/process.js";

export interface ShellToolOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

/**
 * Opt-in shell primitive. It intentionally stays outside the default tool set.
 * Production systems should add sandboxing / permission gates around it.
 */
export function createShellTool(options: ShellToolOptions): Tool {
  return {
    name: "shell",
    description: "Run a shell command in the configured workspace directory.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" }
      },
      required: ["command"],
      additionalProperties: false
    },
    async execute(args, context) {
      const result = await runCommand(String(args.command), {
        cwd: options.cwd,
        signal: context.signal,
        timeoutMs: options.timeoutMs ?? 30_000,
        maxOutputBytes: options.maxOutputBytes ?? 256_000
      });

      const suffix = result.truncated ? "\n[output truncated]" : "";
      return {
        content: [
          `exit_code=${String(result.exitCode)}`,
          result.stdout ? `stdout:\n${result.stdout}` : "",
          result.stderr ? `stderr:\n${result.stderr}` : "",
          suffix
        ].filter(Boolean).join("\n")
      };
    }
  };
}
