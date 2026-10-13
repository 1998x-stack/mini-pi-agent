import { describe, expect, it } from "vitest";
import {
  InMemoryActiveSkillStore,
  SkillActivationService,
  SkillRegistry,
  UnknownSkillError,
  createLoadedSkillSupplement,
  type LoadedSkill,
  type SkillDescriptor,
  type SkillLoader
} from "../src/index.js";

function descriptor(name: string): SkillDescriptor {
  return {
    name,
    description: `${name} description`,
    root: `/tmp/${name}`,
    manifestPath: `/tmp/${name}/SKILL.md`,
    metadata: { owner: "platform" }
  };
}

function loaded(name: string, instructions = `# ${name}\nDo the workflow.`): LoadedSkill {
  return { descriptor: descriptor(name), instructions };
}

class CountingLoader implements SkillLoader {
  calls = 0;
  readonly instructions: string;

  constructor(instructions = "SECRET_FULL_SKILL_BODY") {
    this.instructions = instructions;
  }

  async load(skillDescriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    signal.throwIfAborted();
    this.calls += 1;
    return {
      descriptor: structuredClone(skillDescriptor),
      instructions: this.instructions
    };
  }
}

describe("InMemoryActiveSkillStore", () => {
  it("is idempotent by normalized name and keeps the first active body", () => {
    const store = new InMemoryActiveSkillStore();
    store.activate(loaded("Code-Review", "first body"));
    store.activate(loaded(" code-review ", "second body"));

    expect(store.list()).toHaveLength(1);
    expect(store.get("CODE-REVIEW")?.instructions).toBe("first body");
  });

  it("returns sorted clones and clears run-scoped state", () => {
    const store = new InMemoryActiveSkillStore();
    const source = loaded("zeta");
    store.activate(source);
    store.activate(loaded("alpha"));

    const listed = store.list();
    expect(listed.map((skill) => skill.descriptor.name)).toEqual(["alpha", "zeta"]);
    expect(listed[1]).not.toBe(source);
    expect(listed[1]?.descriptor).not.toBe(source.descriptor);
    expect(listed[1]?.descriptor.metadata).not.toBe(source.descriptor.metadata);

    if (listed[1]?.descriptor.metadata) listed[1].descriptor.metadata.owner = "changed";
    expect(store.get("zeta")?.descriptor.metadata?.owner).toBe("platform");

    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("SkillActivationService", () => {
  it("loads once, activates once, and skips loader on repeated normalized activation", async () => {
    const skill = descriptor("code-review");
    const loader = new CountingLoader();
    const store = new InMemoryActiveSkillStore();
    const service = new SkillActivationService({
      registry: new SkillRegistry([skill]),
      loader,
      activeStore: store
    });
    const signal = new AbortController().signal;

    const first = await service.activate("code-review", signal);
    const second = await service.activate(" CODE-REVIEW ", signal);

    expect(first.status).toBe("activated");
    expect(second.status).toBe("already-active");
    expect(loader.calls).toBe(1);
    expect(store.list()).toHaveLength(1);
  });

  it("fails unknown names with a typed error before loading", async () => {
    const loader = new CountingLoader();
    const service = new SkillActivationService({
      registry: new SkillRegistry([]),
      loader,
      activeStore: new InMemoryActiveSkillStore()
    });

    await expect(
      service.activate("missing", new AbortController().signal)
    ).rejects.toBeInstanceOf(UnknownSkillError);
    expect(loader.calls).toBe(0);
  });

  it("propagates cancellation before registry/loader work", async () => {
    const loader = new CountingLoader();
    const service = new SkillActivationService({
      registry: new SkillRegistry([descriptor("code-review")]),
      loader,
      activeStore: new InMemoryActiveSkillStore()
    });
    const controller = new AbortController();
    const reason = new Error("cancel activation");
    controller.abort(reason);

    await expect(service.activate("code-review", controller.signal)).rejects.toBe(reason);
    expect(loader.calls).toBe(0);
  });

  it("exposes active bodies through context supplements, not activation return text", async () => {
    const body = "# Review\n" + "secret-workflow\n".repeat(20);
    const store = new InMemoryActiveSkillStore();
    const service = new SkillActivationService({
      registry: new SkillRegistry([descriptor("code-review")]),
      loader: new CountingLoader(body),
      activeStore: store
    });

    await service.activate("code-review", new AbortController().signal);
    const supplements = store.list().map(createLoadedSkillSupplement);

    expect(supplements).toHaveLength(1);
    expect(supplements[0]?.kind).toBe("active-skill");
    expect(supplements[0]?.content).toContain("secret-workflow");
  });
});
