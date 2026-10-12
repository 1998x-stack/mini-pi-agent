import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "../core/tool.js";
import { resolveInsideRoot } from "../utils/paths.js";

export function createWriteTool(root: string): Tool {
  return {
    name: "write",
    description: "Create or overwrite a UTF-8 text file inside the workspace root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"],
      additionalProperties: false
    },
    async execute(args) {
      const target = resolveInsideRoot(root, String(args.path));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, String(args.content), "utf8");
      return { content: `Wrote ${Buffer.byteLength(String(args.content), "utf8")} bytes to ${String(args.path)}` };
    }
  };
}
