import { describe, expect, it } from "vitest";
import { ToolRegistry, ToolValidationError, type Tool } from "../src/index.js";

const tool: Tool = {
  name: "sample",
  description: "sample",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  },
  async execute() { return { content: "ok" }; }
};

describe("ToolRegistry", () => {
  it("validates required fields and extra fields", () => {
    const registry = new ToolRegistry([tool]);
    expect(() => registry.validate(tool, {})).toThrow(ToolValidationError);
    expect(() => registry.validate(tool, { name: "x", extra: "y" })).toThrow(ToolValidationError);
    expect(() => registry.validate(tool, { name: "x" })).not.toThrow();
  });
});
