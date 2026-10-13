import { ExtensionHookError } from "../extensions/errors.js";
import type { HookPipeline } from "../extensions/pipeline.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ToolCall, ToolResultMessage } from "./types.js";

export interface ExecuteToolCallInput {
  readonly call: ToolCall;
  readonly tools: ToolRegistry;
  readonly hooks?: HookPipeline;
  readonly cwd: string;
  readonly runId: string;
  readonly turn: number;
  readonly signal: AbortSignal;
}

export interface ToolExecutionOutcome {
  readonly effectiveCall: ToolCall;
  readonly result: ToolResultMessage;
  readonly blockedByExtension?: string;
}

function errorToolResult(call: ToolCall, content: string): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: call.id,
    toolName: call.name,
    content,
    isError: true,
    timestamp: Date.now()
  };
}

/**
 * Execute one ToolCall through the ordinary ToolRegistry path plus the optional
 * Extension before_tool pipeline.
 *
 * Extension handlers may replace arguments or block execution. They cannot
 * replace ToolCall id/name. A block is an explicit ToolResult observation;
 * hook failures and cancellation remain run-level failures.
 */
export async function executeToolCall(
  input: ExecuteToolCallInput
): Promise<ToolExecutionOutcome> {
  input.signal.throwIfAborted();
  let effectiveCall = structuredClone(input.call);

  try {
    const tool = input.tools.get(input.call.name);

    if (input.hooks) {
      const decision = await input.hooks.run(
        "before_tool",
        {
          runId: input.runId,
          turn: input.turn,
          call: effectiveCall
        },
        { signal: input.signal }
      );

      if (decision.action === "block") {
        return {
          effectiveCall: structuredClone(decision.call),
          result: errorToolResult(
            input.call,
            `Tool call '${input.call.name}' blocked by extension '${decision.extensionName}': ${decision.reason}`
          ),
          blockedByExtension: decision.extensionName
        };
      }

      effectiveCall = structuredClone(decision.call);
    }

    input.signal.throwIfAborted();
    input.tools.validate(tool, effectiveCall.arguments);
    const output = await tool.execute(effectiveCall.arguments, {
      cwd: input.cwd,
      signal: input.signal
    });
    input.signal.throwIfAborted();

    return {
      effectiveCall: structuredClone(effectiveCall),
      result: {
        role: "tool",
        toolCallId: input.call.id,
        toolName: input.call.name,
        content: output.content,
        isError: false,
        timestamp: Date.now()
      }
    };
  } catch (error) {
    if (input.signal.aborted) input.signal.throwIfAborted();
    if (error instanceof ExtensionHookError) throw error;

    return {
      effectiveCall: structuredClone(effectiveCall),
      result: errorToolResult(
        input.call,
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      )
    };
  }
}
