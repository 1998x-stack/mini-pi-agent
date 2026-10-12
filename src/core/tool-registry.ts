import { ToolValidationError, UnknownToolError } from "./errors.js";
import type { Tool } from "./tool.js";
import type { JsonValue } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(initialTools: readonly Tool[] = []) {
    for (const tool of initialTools) this.register(tool);
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  replace(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) throw new UnknownToolError(`Unknown tool: ${name}`);
    return tool;
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  validate(tool: Tool, args: Record<string, JsonValue>): void {
    const required = tool.inputSchema.required ?? [];
    for (const key of required) {
      if (!(key in args)) {
        throw new ToolValidationError(`${tool.name}: missing required argument '${key}'`);
      }
    }

    if (tool.inputSchema.additionalProperties === false) {
      const allowed = new Set(Object.keys(tool.inputSchema.properties ?? {}));
      for (const key of Object.keys(args)) {
        if (!allowed.has(key)) {
          throw new ToolValidationError(`${tool.name}: unexpected argument '${key}'`);
        }
      }
    }

    for (const [key, spec] of Object.entries(tool.inputSchema.properties ?? {})) {
      if (!(key in args)) continue;
      const value = args[key];
      if (value === null) {
        throw new ToolValidationError(`${tool.name}: argument '${key}' must be ${spec.type}, received null`);
      }
      const actual = Array.isArray(value) ? "array" : typeof value;
      if (actual !== spec.type) {
        throw new ToolValidationError(
          `${tool.name}: argument '${key}' must be ${spec.type}, received ${actual}`
        );
      }
    }
  }
}
