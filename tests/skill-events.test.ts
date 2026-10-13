import { afterEach, describe, expect, it } from "vitest";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilesystemSkillLoader,
  InMemoryActiveSkillStore,
  LoadSkillTool,
  ManualSkillActivator,
  SkillActivationService,
  SkillEventBus,
  SkillRegistry,
  UnknownSkillError,
  type LoadedSkill,
  type SkillActivationEvent,
  type SkillDescriptor,
  type SkillLoader
} from "../src/index.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function descriptor(name = "code-review"): SkillDescriptor {
  return {
    name,
    description: "Review changes.",
    root: `/virtual/${name}`,
    manifestPath: `/virtual/${name}/SKILL.md`
  };
}

class CountingLoader implements SkillLoader {
  calls = 0;
  constructor(private readonly instructions: string) {}

  async load(value: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    signal.throwIfAborted();
    this.calls += 1;
    return { descriptor: structuredClone(value), instructions: this.instructions };
  }
}

describe("Skill activation lifecycle", () => {
  it("manual and tool activation converge on one service/store and emit metadata-only events", async () => {
    const body = "SECRET-INSTRUCTIONS-" + "x".repeat(2000);
    const loader = new CountingLoader(body);
    const store = new InMemoryActiveSkillStore();
    const events = new SkillEventBus();
    const captured: SkillActivationEvent[] = [];
    events.subscribe((event) => captured.push(structuredClone(event)));

    const service = new SkillActivationService({
      registry: new SkillRegistry([descriptor()]),
      loader,
      activeStore: store,
      events
    });

    const manual = new ManualSkillActivator(service);
    const first = await manual.activate("code-review", new AbortController().signal);
    const second = await new LoadSkillTool(service).execute(
      { name: "CODE-REVIEW" },
      { cwd: process.cwd(), signal: new AbortController().signal }
    );

    expect(first.status).toBe("activated");
    expect(second.content).toBe("Skill 'code-review' is already active.");
    expect(loader.calls).toBe(1);
    expect(store.list()).toHaveLength(1);
    expect(captured.map((event) => event.type)).toEqual([
      "skill_activation_start",
      "skill_activated",
      "skill_activation_start",
      "skill_activation_reused"
    ]);
    expect(captured[0]).toMatchObject({ origin: "manual" });
    expect(captured[2]).toMatchObject({ origin: "tool" });
    expect(JSON.stringify(captured)).not.toContain("SECRET-INSTRUCTIONS");
  });

  it("emits failure metadata and rethrows the original activation error", async () => {
    const events = new SkillEventBus();
    const captured: SkillActivationEvent[] = [];
    events.subscribe((event) => captured.push(event));
    const service = new SkillActivationService({
      registry: new SkillRegistry(),
      loader: new CountingLoader("unused"),
      activeStore: new InMemoryActiveSkillStore(),
      events
    });

    await expect(
      service.activate("missing", new AbortController().signal, { origin: "manual" })
    ).rejects.toBeInstanceOf(UnknownSkillError);

    expect(captured.at(-1)).toMatchObject({
      type: "skill_activation_failed",
      origin: "manual",
      requestedName: "missing",
      errorName: "UnknownSkillError"
    });
  });

  it("isolates event listener failures from activation semantics", async () => {
    const events = new SkillEventBus();
    events.subscribe(() => {
      throw new Error("telemetry failed");
    });
    const service = new SkillActivationService({
      registry: new SkillRegistry([descriptor()]),
      loader: new CountingLoader("body"),
      activeStore: new InMemoryActiveSkillStore(),
      events
    });

    await expect(
      service.activate("code-review", new AbortController().signal)
    ).resolves.toMatchObject({ status: "activated" });
  });

  it("activation loads SKILL.md only; references are not auto-read and scripts are not auto-executed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "mini-pi-skill-boundary-"));
    cleanup.push(workspace);
    const root = join(workspace, "skill");
    const referenceDir = join(root, "references");
    const scriptDir = join(root, "scripts");
    const marker = join(workspace, "SCRIPT-RAN");
    await mkdir(referenceDir, { recursive: true });
    await mkdir(scriptDir, { recursive: true });
    await writeFile(
      join(root, "SKILL.md"),
      "---\nname: guarded\ndescription: Guard resource boundaries.\n---\nRead references/secret.md only when needed. Run scripts/check.sh only through an ordinary tool.",
      "utf8"
    );
    await writeFile(join(referenceDir, "secret.md"), "REFERENCE-SECRET", "utf8");
    await writeFile(join(scriptDir, "check.sh"), `touch ${JSON.stringify(marker)}\n`, "utf8");

    const skillDescriptor: SkillDescriptor = {
      name: "guarded",
      description: "Guard resource boundaries.",
      root,
      manifestPath: join(root, "SKILL.md")
    };
    const events = new SkillEventBus();
    const captured: SkillActivationEvent[] = [];
    events.subscribe((event) => captured.push(event));
    const service = new SkillActivationService({
      registry: new SkillRegistry([skillDescriptor]),
      loader: new FilesystemSkillLoader(),
      activeStore: new InMemoryActiveSkillStore(),
      events
    });

    const result = await new ManualSkillActivator(service).activate(
      "guarded",
      new AbortController().signal
    );

    expect(result.skill.instructions).toContain("references/secret.md");
    expect(JSON.stringify(captured)).not.toContain("REFERENCE-SECRET");
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
