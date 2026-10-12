import { readFile } from "node:fs/promises";
import type { Tool } from "../core/tool.js";
import { resolveInsideRoot } from "../utils/paths.js";

export function createReadTool(root: string): Tool {
  return {
    name: "read",
    description: "Read a UTF-8 text file inside the configured workspace root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to workspace root" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(args) {
      const path = String(args.path);
      return { content: await readFile(resolveInsideRoot(root, path), "utf8") };
    }
  };
}
