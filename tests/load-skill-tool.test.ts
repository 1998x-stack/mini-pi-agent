import { describe, expect, it } from "vitest";
import {
  InMemoryActiveSkillStore,
  InvalidSkillActivationError,
  LoadSkillTool,
  SkillActivationService,
  SkillRegistry,
  UnknownSkillError,
  type LoadedSkill,
  type SkillDescriptor,
  type SkillLoader
} from "../src/index.js";

function descriptor(name: string): SkillDescriptor {
  return {
    name,
    description: `${name} description`,
    root: `/tmp/${name}`,
    manifestPath: `/tmp/${name}/SKILL.md`
  };
}

class FixedLoader implements SkillLoader {
  calls = 0;
  readonly body: string;

  constructor(body: string) {
    this.body = body;
  }

  async load(skillDescriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    signal.throwIfAborted();
    this.calls += 1;
    return {
      descriptor: structuredClone(skillDescriptor),
      instructions: this.body
    };
  }
}

function makeTool(body = "VERY_SECRET_SKILL_BODY") {
  const loader = new FixedLoader(body);
  const activeStore = new InMemoryActiveSkillStore();
  const service = new SkillActivationService({
    registry: new SkillRegistry([descriptor("code-review")]),
    loader,
    activeStore
  });
  return { tool: new LoadSkillTool(service), loader, activeStore };
}

describe("LoadSkillTool", () => {
  it("exposes a strict one-string-argument tool schema", () => {
    const { tool } = makeTool();

    expect(tool.name).toBe("load_skill");
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Exact or case-insensitive Skill name from the available Skill catalog."
        }
      },
      required: ["name"],
      additionalProperties: false
    });
  });

  it("returns a compact acknowledgement without duplicating full Skill instructions", async () => {
    const body = "SECRET_MARKER\n" + "x".repeat(20_000);
    const { tool, activeStore } = makeTool(body);

    const result = await tool.execute(
      { name: "code-review" },
      { cwd: "/tmp", signal: new AbortController().signal }
    );

    expect(result.content).toBe("Skill 'code-review' activated.");
    expect(result.content).not.toContain("SECRET_MARKER");
    expect(result.content.length).toBeLessThan(100);
    expect(activeStore.get("code-review")?.instructions).toBe(body);
  });

  it("reports repeated activation compactly and does not reload", async () => {
    const { tool, loader } = makeTool();
    const context = { cwd: "/tmp", signal: new AbortController().signal };

    const first = await tool.execute({ name: "code-review" }, context);
    const second = await tool.execute({ name: " CODE-REVIEW " }, context);

    expect(first.content).toBe("Skill 'code-review' activated.");
    expect(second.content).toBe("Skill 'code-review' is already active.");
    expect(loader.calls).toBe(1);
  });

  it("rejects invalid direct-call arguments", async () => {
    const { tool } = makeTool();
    const context = { cwd: "/tmp", signal: new AbortController().signal };

    await expect(tool.execute({}, context)).rejects.toBeInstanceOf(InvalidSkillActivationError);
    await expect(tool.execute({ name: 42 }, context)).rejects.toBeInstanceOf(InvalidSkillActivationError);
    await expect(tool.execute({ name: "   " }, context)).rejects.toBeInstanceOf(InvalidSkillActivationError);
  });

  it("propagates unknown Skill failures and cancellation", async () => {
    const loader = new FixedLoader("body");
    const service = new SkillActivationService({
      registry: new SkillRegistry([]),
      loader,
      activeStore: new InMemoryActiveSkillStore()
    });
    const tool = new LoadSkillTool(service);

    await expect(
      tool.execute(
        { name: "missing" },
        { cwd: "/tmp", signal: new AbortController().signal }
      )
    ).rejects.toBeInstanceOf(UnknownSkillError);

    const controller = new AbortController();
    const reason = new Error("cancel load_skill");
    controller.abort(reason);
    await expect(
      tool.execute({ name: "missing" }, { cwd: "/tmp", signal: controller.signal })
    ).rejects.toBe(reason);
  });
});
