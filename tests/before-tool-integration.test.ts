import { describe, expect, it } from "vitest";
import {
  EventBus,
  ExtensionHookError,
  ExtensionHost,
  HookPipeline,
  IdentityContextTransform,
  ToolRegistry,
  executeToolCall,
  runAgentLoop,
  type AgentState,
  type AssistantMessage,
  type LLMProvider,
  type LLMRequest,
  type Tool
} from "../src/index.js";
import { MessageQueue } from "../src/core/queues.js";

function stringTool(name: string, onExecute?: (value: string) => void): Tool {
  return {
    name,
    description: `tool ${name}`,
    inputSchema: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false
    },
    async execute(args) {
      const value = String(args.value);
      onExecute?.(value);
      return { content: `${name}:${value}` };
    }
  };
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("before_tool runtime integration", () => {
  it("replaces arguments before validation and execution while preserving call identity", async () => {
    const tools = new ToolRegistry([stringTool("demo")]);
    const hooks = new HookPipeline();
    let executedValue = "";
    tools.replace(stringTool("demo", (value) => { executedValue = value; }));

    hooks.register({ extensionName: "rewrite" }, "before_tool", (event) => ({
      action: "replace",
      arguments: { ...event.call.arguments, value: "approved" }
    }));

    const outcome = await executeToolCall({
      call: {
        id: "call-1",
        name: "demo",
        // This would fail schema validation without the hook replacement.
        arguments: { value: 42 }
      },
      tools,
      hooks,
      cwd: "/tmp",
      runId: "run-1",
      turn: 1,
      signal: signal()
    });

    expect(outcome.effectiveCall).toEqual({
      id: "call-1",
      name: "demo",
      arguments: { value: "approved" }
    });
    expect(outcome.result).toMatchObject({
      toolCallId: "call-1",
      toolName: "demo",
      content: "demo:approved",
      isError: false
    });
    expect(executedValue).toBe("approved");
  });

  it("turns a block into an explicit ToolResult and never executes the Tool", async () => {
    let executions = 0;
    const tools = new ToolRegistry([
      stringTool("dangerous", () => { executions += 1; })
    ]);
    const hooks = new HookPipeline();

    hooks.register({ extensionName: "project-policy" }, "before_tool", () => ({
      action: "block",
      reason: "writes are disabled"
    }));

    const outcome = await executeToolCall({
      call: { id: "call-2", name: "dangerous", arguments: { value: "x" } },
      tools,
      hooks,
      cwd: "/tmp",
      runId: "run-1",
      turn: 1,
      signal: signal()
    });

    expect(executions).toBe(0);
    expect(outcome.blockedByExtension).toBe("project-policy");
    expect(outcome.result).toMatchObject({
      role: "tool",
      toolCallId: "call-2",
      toolName: "dangerous",
      isError: true
    });
    expect(outcome.result.content).toContain("blocked by extension 'project-policy'");
    expect(outcome.result.content).toContain("writes are disabled");
  });

  it("runs built-in and Extension-owned Tools through the same before_tool pipeline", async () => {
    const tools = new ToolRegistry([stringTool("builtin")]);
    const hooks = new HookPipeline();
    const host = new ExtensionHost({ pipeline: hooks, tools });
    const seen: string[] = [];

    await host.load({
      name: "project-tools",
      setup(api) {
        api.registerTool(stringTool("extension_tool"));
        api.on("before_tool", (event) => {
          seen.push(event.call.name);
          return { action: "continue" };
        });
      }
    });

    for (const name of ["builtin", "extension_tool"]) {
      const outcome = await executeToolCall({
        call: { id: `call-${name}`, name, arguments: { value: "ok" } },
        tools,
        hooks,
        cwd: "/tmp",
        runId: "run-1",
        turn: 1,
        signal: signal()
      });
      expect(outcome.result.isError).toBe(false);
    }

    expect(seen).toEqual(["builtin", "extension_tool"]);
  });

  it("propagates ExtensionHookError and cancellation instead of converting them into ToolResults", async () => {
    const tools = new ToolRegistry([stringTool("demo")]);
    const broken = new HookPipeline();
    const cause = new Error("policy crashed");

    broken.register({ extensionName: "broken" }, "before_tool", () => {
      throw cause;
    });

    await expect(executeToolCall({
      call: { id: "call-3", name: "demo", arguments: { value: "ok" } },
      tools,
      hooks: broken,
      cwd: "/tmp",
      runId: "run-1",
      turn: 1,
      signal: signal()
    })).rejects.toMatchObject({
      extensionName: "broken",
      hook: "before_tool",
      cause
    } satisfies Partial<ExtensionHookError>);

    const controller = new AbortController();
    const reason = new Error("stop run");
    const cancelling = new HookPipeline();
    cancelling.register({ extensionName: "cancel" }, "before_tool", () => {
      controller.abort(reason);
      return { action: "continue" };
    });

    await expect(executeToolCall({
      call: { id: "call-4", name: "demo", arguments: { value: "ok" } },
      tools,
      hooks: cancelling,
      cwd: "/tmp",
      runId: "run-1",
      turn: 1,
      signal: controller.signal
    })).rejects.toBe(reason);
  });

  it("persists a blocked ToolResult so the next model turn can observe the denial", async () => {
    let executions = 0;
    const tools = new ToolRegistry([
      stringTool("deploy", () => { executions += 1; })
    ]);
    const hooks = new HookPipeline();
    hooks.register({ extensionName: "deployment-policy" }, "before_tool", () => ({
      action: "block",
      reason: "deployments require approval"
    }));

    class BlockingProvider implements LLMProvider {
      readonly id = "blocking-provider";
      readonly requests: LLMRequest[] = [];
      private step = 0;

      async complete(request: LLMRequest): Promise<AssistantMessage> {
        this.requests.push({
          ...request,
          messages: request.messages.map((message) => structuredClone(message)),
          tools: [...request.tools]
        });

        if (this.step++ === 0) {
          return {
            role: "assistant",
            content: "deploying",
            toolCalls: [
              {
                id: "deploy-1",
                name: "deploy",
                arguments: { value: "production" }
              }
            ],
            timestamp: 1,
            model: this.id
          };
        }

        return {
          role: "assistant",
          content: "I saw the denial.",
          toolCalls: [],
          timestamp: 2,
          model: this.id
        };
      }
    }

    const provider = new BlockingProvider();
    const state: AgentState = {
      systemPrompt: "test",
      messages: [],
      running: false,
      runId: undefined,
      turn: 0
    };

    const run = await runAgentLoop(
      state,
      "deploy now",
      {
        provider,
        tools,
        hooks,
        events: new EventBus(),
        steering: new MessageQueue(),
        followups: new MessageQueue(),
        session: undefined,
        contextRuntime: undefined,
        contextTransform: new IdentityContextTransform(),
        cwd: "/tmp",
        maxTurns: 3
      },
      signal()
    );

    expect(run.turns).toBe(2);
    expect(executions).toBe(0);

    const blocked = state.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "deploy-1"
    );
    expect(blocked).toMatchObject({ isError: true, toolName: "deploy" });
    expect(blocked?.content).toContain("deployment-policy");

    expect(provider.requests).toHaveLength(2);
    const secondRequestBlocked = provider.requests[1]!.messages.find(
      (message) => message.role === "tool" && message.toolCallId === "deploy-1"
    );
    expect(secondRequestBlocked).toMatchObject({ isError: true, toolName: "deploy" });
  });
});
