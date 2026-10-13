import {
  InMemoryActiveSkillStore,
  ManualSkillActivator,
  SkillActivationService,
  SkillEventBus,
  SkillRegistry,
  type LoadedSkill,
  type SkillDescriptor,
  type SkillLoader
} from "../src/index.js";

const descriptor: SkillDescriptor = {
  name: "code-review",
  description: "Review changes for correctness and regressions.",
  root: "/demo/.mini-pi/skills/code-review",
  manifestPath: "/demo/.mini-pi/skills/code-review/SKILL.md"
};

class DemoLoader implements SkillLoader {
  async load(value: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    signal.throwIfAborted();
    return {
      descriptor: structuredClone(value),
      instructions: [
        "# Code Review",
        "Inspect the diff before making claims.",
        "Read references/security.md through the ordinary read tool only when needed.",
        "Run scripts/check.mjs only through an ordinary execution tool when explicitly useful."
      ].join("\n")
    };
  }
}

const activeStore = new InMemoryActiveSkillStore();
const events = new SkillEventBus();
events.subscribe((event) => console.log("skill event:", event));

const service = new SkillActivationService({
  registry: new SkillRegistry([descriptor]),
  loader: new DemoLoader(),
  activeStore,
  events
});

const manual = new ManualSkillActivator(service);
const result = await manual.activate("code-review", new AbortController().signal);

console.log("activation:", result.status);
console.log("active skills:", activeStore.list().map((skill) => skill.descriptor.name));
console.log("instructions are stored as active knowledge, not emitted in lifecycle events.");
