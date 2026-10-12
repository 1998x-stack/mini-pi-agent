import { readFile, writeFile } from "node:fs/promises";
import type { Tool } from "../core/tool.js";
import { resolveInsideRoot } from "../utils/paths.js";

export function createEditTool(root: string): Tool {
  return {
    name: "edit",
    description: "Replace one exact text occurrence in an existing UTF-8 file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        oldText: { type: "string" },
        newText: { type: "string" }
      },
      required: ["path", "oldText", "newText"],
      additionalProperties: false
    },
    async execute(args) {
      const target = resolveInsideRoot(root, String(args.path));
      const oldText = String(args.oldText);
      const newText = String(args.newText);
      const text = await readFile(target, "utf8");
      const first = text.indexOf(oldText);
      if (first < 0) throw new Error("oldText not found");
      const second = text.indexOf(oldText, first + oldText.length);
      if (second >= 0) throw new Error("oldText is ambiguous: found more than once");
      await writeFile(target, `${text.slice(0, first)}${newText}${text.slice(first + oldText.length)}`, "utf8");
      return { content: `Edited ${String(args.path)}` };
    }
  };
}
