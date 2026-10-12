import type { JsonValue } from "./types.js";

export type JsonSchema = {
  type: "object";
  properties?: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description?: string;
  }>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface ToolExecutionContext {
  cwd: string;
  signal: AbortSignal;
}

export interface ToolResult {
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(
    args: Record<string, JsonValue>,
    context: ToolExecutionContext
  ): Promise<ToolResult>;
}
