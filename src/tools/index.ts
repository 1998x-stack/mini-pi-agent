export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";
export { createEditTool } from "./edit.js";
export { createShellTool, type ShellToolOptions } from "./shell.js";

import type { Tool } from "../core/tool.js";
import { createEditTool } from "./edit.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";

export function createSafeFileTools(root: string): Tool[] {
  return [createReadTool(root), createWriteTool(root), createEditTool(root)];
}
