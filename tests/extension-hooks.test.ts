import { describe, expect, it } from "vitest";
import {
  ExtensionHookError,
  HookPipeline,
  InvalidHookRegistrationError,
  type BeforeToolEvent,
  type ToolResultMessage
} from "../src/index.js";

function signal(): AbortSignal {
  return new AbortController().signal;
}

function beforeToolEvent(): BeforeToolEvent {
  return {
    runId: "run-1",
    turn: 2,
    call: {
      id: "call-1",
      name: "demo",
      arguments: { value: 1, label: "start" }
    }
  };
}

describe("HookPipeline", () => {
  it("executes handlers in registration order without a priority system", async () => {
    const pipeline = new HookPipeline();
    const seen: string[] = [];

    pipeline.register({ extensionName: "alpha" }, "after_turn", () => {
      seen.push("alpha-1");
    });
    pipeline.register({ extensionName: "alpha" }, "after_turn", () => {
      seen.push("alpha-2");
    });
    pipeline.register({ extensionName: "beta" }, "after_turn", () => {
      seen.push("beta-1");
    });

    await pipeline.run(
      "after_turn",
      { runId: "run-1", turn: 1 },
      { signal: signal() }
    );

    expect(seen).toEqual(["alpha-1", "alpha-2", "beta-1"]);
  });

  it("chains before_tool argument replacements into later handlers", async () => {
    const pipeline = new HookPipeline();
    const seenValues: number[] = [];

    pipeline.register({ extensionName: "first" }, "before_tool", (event) => {
      seenValues.push(event.call.arguments.value as number);
      return {
        action: "replace",
        arguments: { ...event.call.arguments, value: 2 }
      };
    });
    pipeline.register({ extensionName: "second" }, "before_tool", (event) => {
      seenValues.push(event.call.arguments.value as number);
      return {
        action: "replace",
        arguments: { ...event.call.arguments, value: 3 }
      };
    });

    const source = beforeToolEvent();
    const before = structuredClone(source);
    const result = await pipeline.run("before_tool", source, { signal: signal() });

    expect(result).toEqual({
      action: "continue",
      call: {
        id: "call-1",
        name: "demo",
        arguments: { value: 3, label: "start" }
      }
    });
    expect(seenValues).toEqual([1, 2]);
    expect(source).toEqual(before);
  });

  it("ignores direct event mutation unless a handler returns an explicit transform", async () => {
    const pipeline = new HookPipeline();
    const observed: number[] = [];

    pipeline.register({ extensionName: "mutator" }, "before_tool", (event) => {
      event.call.arguments.value = 999;
      return { action: "continue" };
    });
    pipeline.register({ extensionName: "observer" }, "before_tool", (event) => {
      observed.push(event.call.arguments.value as number);
      return { action: "continue" };
    });

    const source = beforeToolEvent();
    const result = await pipeline.run("before_tool", source, { signal: signal() });

    expect(observed).toEqual([1]);
    expect(source.call.arguments.value).toBe(1);
    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      expect(result.call.arguments.value).toBe(1);
    }
  });

  it("short-circuits before_tool after block and records the blocking owner", async () => {
    const pipeline = new HookPipeline();
    const seen: string[] = [];

    pipeline.register({ extensionName: "rewrite" }, "before_tool", (event) => {
      seen.push("rewrite");
      return {
        action: "replace",
        arguments: { ...event.call.arguments, value: 2 }
      };
    });
    pipeline.register({ extensionName: "policy" }, "before_tool", (event) => {
      seen.push(`policy:${String(event.call.arguments.value)}`);
      return { action: "block", reason: "project policy denied this call" };
    });
    pipeline.register({ extensionName: "never" }, "before_tool", () => {
      seen.push("never");
      return { action: "continue" };
    });

    const result = await pipeline.run(
      "before_tool",
      beforeToolEvent(),
      { signal: signal() }
    );

    expect(result).toEqual({
      action: "block",
      call: {
        id: "call-1",
        name: "demo",
        arguments: { value: 2, label: "start" }
      },
      reason: "project policy denied this call",
      extensionName: "policy"
    });
    expect(seen).toEqual(["rewrite", "policy:2"]);
  });

  it("chains after_tool result transforms while preserving the source event", async () => {
    const pipeline = new HookPipeline();
    const original: ToolResultMessage = {
      role: "tool",
      toolCallId: "call-1",
      toolName: "demo",
      content: "raw secret",
      isError: false,
      timestamp: 10
    };

    pipeline.register({ extensionName: "redact" }, "after_tool", (event) => ({
      result: { ...event.result, content: "[redacted]" }
    }));
    pipeline.register({ extensionName: "annotate" }, "after_tool", (event) => ({
      result: { ...event.result, content: `${event.result.content}\nnormalized` }
    }));

    const result = await pipeline.run(
      "after_tool",
      {
        runId: "run-1",
        turn: 1,
        call: beforeToolEvent().call,
        result: original
      },
      { signal: signal() }
    );

    expect(result.result.content).toBe("[redacted]\nnormalized");
    expect(original.content).toBe("raw secret");
  });

  it("collects context contributions in deterministic registration order", async () => {
    const pipeline = new HookPipeline();

    pipeline.register({ extensionName: "one" }, "before_model", () => ({
      supplements: [
        { id: "one", kind: "skill-catalog", content: "first", required: true }
      ]
    }));
    pipeline.register({ extensionName: "two" }, "before_model", () => ({
      supplements: [
        { id: "two", kind: "active-skill", content: "second", required: true }
      ]
    }));

    const result = await pipeline.run(
      "before_model",
      { runId: "run-1", turn: 1 },
      { signal: signal() }
    );

    expect(result.supplements.map((item) => item.id)).toEqual(["one", "two"]);
  });

  it("disposes exactly one registration", async () => {
    const pipeline = new HookPipeline();
    const seen: string[] = [];
    const first = pipeline.register({ extensionName: "one" }, "after_turn", () => {
      seen.push("one");
    });
    pipeline.register({ extensionName: "two" }, "after_turn", () => {
      seen.push("two");
    });

    first.dispose();
    first.dispose();
    await pipeline.run(
      "after_turn",
      { runId: "run-1", turn: 1 },
      { signal: signal() }
    );

    expect(seen).toEqual(["two"]);
  });

  it("preserves abort reasons and stops later handlers", async () => {
    const pipeline = new HookPipeline();
    const controller = new AbortController();
    const reason = new Error("stop extensions");
    const seen: string[] = [];

    pipeline.register({ extensionName: "aborter" }, "before_tool", () => {
      seen.push("aborter");
      controller.abort(reason);
      return { action: "continue" };
    });
    pipeline.register({ extensionName: "never" }, "before_tool", () => {
      seen.push("never");
      return { action: "continue" };
    });

    await expect(
      pipeline.run("before_tool", beforeToolEvent(), { signal: controller.signal })
    ).rejects.toBe(reason);
    expect(seen).toEqual(["aborter"]);
  });

  it("wraps handler failures with extension and hook provenance", async () => {
    const pipeline = new HookPipeline();
    const cause = new Error("broken policy");

    pipeline.register({ extensionName: "policy" }, "before_tool", () => {
      throw cause;
    });

    try {
      await pipeline.run("before_tool", beforeToolEvent(), { signal: signal() });
      throw new Error("expected hook failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionHookError);
      const hookError = error as ExtensionHookError;
      expect(hookError.extensionName).toBe("policy");
      expect(hookError.hook).toBe("before_tool");
      expect(hookError.cause).toBe(cause);
    }
  });

  it("rejects blank registration owners", () => {
    const pipeline = new HookPipeline();
    expect(() =>
      pipeline.register({ extensionName: "   " }, "after_turn", () => undefined)
    ).toThrow(InvalidHookRegistrationError);
  });
});
