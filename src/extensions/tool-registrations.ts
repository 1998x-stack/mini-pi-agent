import type { Tool } from "../core/tool.js";
import type { ToolRegistry } from "../core/tool-registry.js";
import type { Disposable } from "./hooks.js";
import type { ExtensionRegistrationSet } from "./registrations.js";

/**
 * Register one ordinary Tool and attach its removable registration to the
 * Extension ownership set used for setup rollback and unload.
 */
export function registerOwnedTool(
  tools: ToolRegistry,
  registrations: ExtensionRegistrationSet,
  tool: Tool
): Disposable {
  return registrations.add(tools.register(tool));
}
