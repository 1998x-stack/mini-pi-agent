import { describe, expect, it } from "vitest";
import {
  ExtensionApiClosedError,
  ExtensionHost,
  ExtensionSetupError,
  HookPipeline,
  ToolAlreadyRegisteredError,
  ToolRegistry,
  type ExtensionAPI,
  type Tool
} from "../src/index.js";

function makeTool(name: string, prefix = name): Tool {
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
      return { content: `${prefix}:${String(args.value)}` };
    }
  };
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("Extension-owned Tool registrations", () => {
  it("registers Extension Tools into the ordinary ToolRegistry path", async () => {
    const tools = new ToolRegistry([makeTool("builtin", "core")]);
    const host = new ExtensionHost({ pipeline: new HookPipeline(), tools });

    await host.load({
      name: "project-tools",
      setup(api) {
        api.registerTool(makeTool("project_status", "extension"));
      }
    });

    expect(tools.list().map((tool) => tool.name)).toEqual(["builtin", "project_status"]);

    const tool = tools.get("project_status");
    tools.validate(tool, { value: "ok" });
    await expect(
      tool.execute({ value: "ok" }, { cwd: "/tmp", signal: signal() })
    ).resolves.toEqual({ content: "extension:ok" });
  });

  it("rolls back hooks and tools when setup collides with an existing Tool", async () => {
    const builtin = makeTool("deploy", "builtin");
    const tools = new ToolRegistry([builtin]);
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline, tools });
    const seen: string[] = [];

    try {
      await host.load({
        name: "deployment-extension",
        setup(api) {
          api.on("after_turn", () => { seen.push("should-not-remain"); });
          api.registerTool(makeTool("deploy", "extension"));
        }
      });
      throw new Error("expected tool collision");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionSetupError);
      const setupError = error as ExtensionSetupError;
      expect(setupError.cause).toBeInstanceOf(ToolAlreadyRegisteredError);
      expect((setupError.cause as ToolAlreadyRegisteredError).toolName).toBe("deploy");
    }

    expect(host.list()).toEqual([]);
    expect(tools.get("deploy")).toBe(builtin);
    expect(tools.list().map((tool) => tool.name)).toEqual(["deploy"]);

    await pipeline.run("after_turn", { runId: "run", turn: 1 }, { signal: signal() });
    expect(seen).toEqual([]);
  });

  it("removes only the unloaded Extension's hooks and Tools", async () => {
    const builtin = makeTool("builtin", "core");
    const tools = new ToolRegistry([builtin]);
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline, tools });
    const seen: string[] = [];

    await host.load({
      name: "alpha",
      setup(api) {
        api.registerTool(makeTool("alpha_tool"));
        api.on("after_turn", () => { seen.push("alpha"); });
      }
    });
    await host.load({
      name: "beta",
      setup(api) {
        api.registerTool(makeTool("beta_tool"));
        api.on("after_turn", () => { seen.push("beta"); });
      }
    });

    await host.unload("alpha");

    expect(tools.list().map((tool) => tool.name)).toEqual(["builtin", "beta_tool"]);
    expect(tools.get("builtin")).toBe(builtin);
    expect(tools.get("beta_tool").name).toBe("beta_tool");
    expect(() => tools.get("alpha_tool")).toThrow(/Unknown tool/);

    await pipeline.run("after_turn", { runId: "run", turn: 1 }, { signal: signal() });
    expect(seen).toEqual(["beta"]);
  });

  it("removes an Extension Tool when later setup work fails", async () => {
    const tools = new ToolRegistry();
    const host = new ExtensionHost({ pipeline: new HookPipeline(), tools });
    const cause = new Error("late setup failure");

    await expect(host.load({
      name: "broken",
      setup(api) {
        api.registerTool(makeTool("temporary"));
        throw cause;
      }
    })).rejects.toMatchObject({ cause });

    expect(tools.list()).toEqual([]);
    expect(host.list()).toEqual([]);
  });

  it("does not let an old registration handle delete a later replacement", () => {
    const tools = new ToolRegistry();
    const original = makeTool("shared", "original");
    const replacement = makeTool("shared", "replacement");

    const registration = tools.register(original);
    tools.replace(replacement);
    registration.dispose();

    expect(tools.get("shared")).toBe(replacement);
  });

  it("keeps registerTool setup-scoped", async () => {
    const tools = new ToolRegistry();
    const host = new ExtensionHost({ pipeline: new HookPipeline(), tools });
    let api: ExtensionAPI | undefined;

    await host.load({
      name: "capture",
      setup(value) {
        api = value;
      }
    });

    expect(() => api!.registerTool(makeTool("late"))).toThrow(ExtensionApiClosedError);
    expect(tools.list()).toEqual([]);
  });
});
