import { describe, expect, it } from "vitest";
import {
  DuplicateExtensionError,
  ExtensionApiClosedError,
  ExtensionHost,
  ExtensionSetupError,
  HookPipeline,
  InvalidExtensionDefinitionError,
  UnknownExtensionError,
  type ExtensionAPI,
  type ExtensionDefinition
} from "../src/index.js";

function signal(): AbortSignal {
  return new AbortController().signal;
}

async function runAfterTurn(pipeline: HookPipeline): Promise<void> {
  await pipeline.run("after_turn", { runId: "run-1", turn: 1 }, { signal: signal() });
}

describe("ExtensionHost", () => {
  it("loads extensions deterministically and preserves setup registration order", async () => {
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline });
    const seen: string[] = [];

    await host.load({
      name: "Alpha",
      version: "1.0.0",
      setup(api) {
        api.on("after_turn", () => { seen.push("alpha-1"); });
        api.on("after_turn", () => { seen.push("alpha-2"); });
      }
    });
    await host.load({
      name: "beta",
      setup(api) {
        api.on("after_turn", () => { seen.push("beta-1"); });
      }
    });

    await runAfterTurn(pipeline);
    expect(seen).toEqual(["alpha-1", "alpha-2", "beta-1"]);
    expect(host.list()).toEqual([
      { name: "Alpha", normalizedName: "alpha", version: "1.0.0", loadIndex: 0 },
      { name: "beta", normalizedName: "beta", loadIndex: 1 }
    ]);
  });

  it("serializes async load operations by invocation order", async () => {
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline });
    const seen: string[] = [];

    let releaseAlpha!: () => void;
    const alphaGate = new Promise<void>((resolve) => { releaseAlpha = resolve; });

    const alpha = host.load({
      name: "alpha",
      async setup(api) {
        seen.push("alpha-start");
        api.on("after_turn", () => { seen.push("alpha-hook"); });
        await alphaGate;
        seen.push("alpha-end");
      }
    });

    const beta = host.load({
      name: "beta",
      setup(api) {
        seen.push("beta-start");
        api.on("after_turn", () => { seen.push("beta-hook"); });
      }
    });

    await Promise.resolve();
    expect(seen).toEqual(["alpha-start"]);
    releaseAlpha();
    await Promise.all([alpha, beta]);

    expect(seen.slice(0, 3)).toEqual(["alpha-start", "alpha-end", "beta-start"]);
    await runAfterTurn(pipeline);
    expect(seen.slice(-2)).toEqual(["alpha-hook", "beta-hook"]);
  });

  it("rejects normalized duplicate extension names before setup", async () => {
    const host = new ExtensionHost({ pipeline: new HookPipeline() });
    let secondSetupCalled = false;

    await host.load({ name: "Policy", setup() {} });

    await expect(host.load({
      name: " policy ",
      setup() { secondSetupCalled = true; }
    })).rejects.toBeInstanceOf(DuplicateExtensionError);

    expect(secondSetupCalled).toBe(false);
    expect(host.list()).toHaveLength(1);
  });

  it("rolls back every owned registration when setup fails", async () => {
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline });
    const seen: string[] = [];
    const cause = new Error("setup exploded");

    await host.load({
      name: "stable",
      setup(api) {
        api.on("after_turn", () => { seen.push("stable"); });
      }
    });

    try {
      await host.load({
        name: "broken",
        setup(api) {
          api.on("after_turn", () => { seen.push("broken-1"); });
          api.on("after_turn", () => { seen.push("broken-2"); });
          api.on("after_turn", () => { seen.push("broken-3"); });
          throw cause;
        }
      });
      throw new Error("expected setup failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionSetupError);
      const setupError = error as ExtensionSetupError;
      expect(setupError.extensionName).toBe("broken");
      expect(setupError.cause).toBe(cause);
    }

    expect(host.list().map((item) => item.name)).toEqual(["stable"]);
    await runAfterTurn(pipeline);
    expect(seen).toEqual(["stable"]);
  });

  it("unloads exactly one extension's registrations", async () => {
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline });
    const seen: string[] = [];

    await host.load({
      name: "alpha",
      setup(api) {
        api.on("after_turn", () => { seen.push("alpha-1"); });
        api.on("after_turn", () => { seen.push("alpha-2"); });
      }
    });
    await host.load({
      name: "beta",
      setup(api) {
        api.on("after_turn", () => { seen.push("beta"); });
      }
    });

    await host.unload(" ALPHA ");
    await runAfterTurn(pipeline);

    expect(seen).toEqual(["beta"]);
    expect(host.list().map((item) => item.name)).toEqual(["beta"]);
    await expect(host.unload("missing")).rejects.toBeInstanceOf(UnknownExtensionError);
  });

  it("closes setup capabilities after both successful and failed setup", async () => {
    const pipeline = new HookPipeline();
    const host = new ExtensionHost({ pipeline });
    let successfulApi: ExtensionAPI | undefined;
    let failedApi: ExtensionAPI | undefined;

    await host.load({
      name: "success",
      setup(api) { successfulApi = api; }
    });

    await expect(host.load({
      name: "failure",
      setup(api) {
        failedApi = api;
        throw new Error("fail");
      }
    })).rejects.toBeInstanceOf(ExtensionSetupError);

    expect(() => successfulApi!.on("after_turn", () => {}))
      .toThrow(ExtensionApiClosedError);
    expect(() => failedApi!.on("after_turn", () => {}))
      .toThrow(ExtensionApiClosedError);
  });

  it("returns cloned descriptors and validates definitions", async () => {
    const host = new ExtensionHost({ pipeline: new HookPipeline() });
    await host.load({ name: "alpha", version: "1", setup() {} });

    const first = host.get("alpha")!;
    const second = host.get("ALPHA")!;
    expect(first).toEqual(second);
    expect(first).not.toBe(second);

    const listed = host.list();
    expect(listed[0]).not.toBe(first);

    await expect(host.load({ name: "   ", setup() {} }))
      .rejects.toBeInstanceOf(InvalidExtensionDefinitionError);

    const invalidVersion: ExtensionDefinition = {
      name: "bad-version",
      version: "   ",
      setup() {}
    };
    await expect(host.load(invalidVersion))
      .rejects.toBeInstanceOf(InvalidExtensionDefinitionError);
  });
});
