import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  ApproximateTokenEstimator,
  FilesystemSkillLoader,
  KeepRecentContextPlanner,
  type AgentEvent,
  type AssistantMessage,
  type LLMProvider,
  type LLMRequest,
  type LoadedSkill,
  type SkillDescriptor,
  type SkillLoader
} from "../src/index.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function createWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "mini-pi-agent-skills-"));
  cleanupPaths.push(cwd);
  const skillsRoot = join(cwd, ".mini-pi", "skills");
  await mkdir(join(skillsRoot, "code-review"), { recursive: true });
  await mkdir(join(skillsRoot, "release"), { recursive: true });

  await writeFile(
    join(skillsRoot, "code-review", "SKILL.md"),
    [
      "---",
      "name: code-review",
      "description: Review code changes for bugs and regressions.",
      "---",
      "# Code Review",
      "CODE_REVIEW_BODY_SECRET",
      "Inspect the diff before making claims."
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    join(skillsRoot, "release", "SKILL.md"),
    [
      "---",
      "name: release",
      "description: Prepare a deterministic release checklist.",
      "---",
      "# Release",
      "RELEASE_BODY_SECRET",
      "Verify changelog and version metadata."
    ].join("\n"),
    "utf8"
  );

  return cwd;
}

class CountingSkillLoader implements SkillLoader {
  readonly calls: string[] = [];
  private readonly inner = new FilesystemSkillLoader();

  async load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    this.calls.push(descriptor.name);
    return await this.inner.load(descriptor, signal);
  }
}

class ProgressiveSkillsProvider implements LLMProvider {
  readonly id = "progressive-skills-test";
  readonly requests: LLMRequest[] = [];
  private step = 0;

  async complete(request: LLMRequest): Promise<AssistantMessage> {
    this.requests.push({
      ...request,
      messages: request.messages.map((message) => structuredClone(message)),
      tools: [...request.tools]
    });

    const step = this.step++;
    if (step === 0) {
      return {
        role: "assistant",
        content: "I will load the relevant workflow.",
        toolCalls: [
          {
            id: "load-code-review",
            name: "load_skill",
            arguments: { name: "code-review" }
          }
        ],
        timestamp: 1,
        model: this.id
      };
    }

    return {
      role: "assistant",
      content: step === 1 ? "first run complete" : "second run complete",
      toolCalls: [],
      timestamp: step + 1,
      model: this.id
    };
  }
}

function contextOptions() {
  const estimator = new ApproximateTokenEstimator();
  return {
    planner: new KeepRecentContextPlanner({ estimator }),
    budget: {
      contextWindow: 32_000,
      outputReserve: 1_000,
      safetyMargin: 500
    }
  };
}

describe("Agent Skills integration", () => {
  it("progressively exposes one activated Skill and clears it between prompts", async () => {
    const cwd = await createWorkspace();
    const loader = new CountingSkillLoader();
    const provider = new ProgressiveSkillsProvider();
    const events: AgentEvent[] = [];

    const agent = await Agent.create({
      provider,
      cwd,
      maxTurns: 4,
      context: contextOptions(),
      skills: { loader }
    });
    agent.subscribe((event) => {
      events.push(structuredClone(event));
    });

    const firstRun = await agent.prompt("review this change");
    expect(firstRun.turns).toBe(2);
    expect(provider.requests).toHaveLength(2);

    const firstRequest = provider.requests[0]!;
    expect(firstRequest.systemPrompt).toContain("code-review");
    expect(firstRequest.systemPrompt).toContain("release");
    expect(firstRequest.systemPrompt).not.toContain("CODE_REVIEW_BODY_SECRET");
    expect(firstRequest.systemPrompt).not.toContain("RELEASE_BODY_SECRET");
    expect(firstRequest.tools.some((tool) => tool.name === "load_skill")).toBe(true);

    const afterActivation = provider.requests[1]!;
    expect(afterActivation.systemPrompt).toContain("CODE_REVIEW_BODY_SECRET");
    expect(afterActivation.systemPrompt).not.toContain("RELEASE_BODY_SECRET");
    expect(loader.calls).toEqual(["code-review"]);

    const toolResult = agent.state.messages.find(
      (message) => message.role === "tool" && message.toolName === "load_skill"
    );
    expect(toolResult?.content).toBe("Skill 'code-review' activated.");
    expect(toolResult?.content).not.toContain("CODE_REVIEW_BODY_SECRET");
    expect(
      agent.state.messages.some((message) => message.content.includes("<active_skill"))
    ).toBe(false);

    const serializedEvents = JSON.stringify(events);
    expect(events.some((event) => event.type === "skill_activation_start")).toBe(true);
    expect(events.some((event) => event.type === "skill_activated")).toBe(true);
    expect(serializedEvents).not.toContain("CODE_REVIEW_BODY_SECRET");

    const secondRun = await agent.prompt("what now?");
    expect(secondRun.turns).toBe(1);
    expect(provider.requests).toHaveLength(3);

    const nextRunFirstRequest = provider.requests[2]!;
    expect(nextRunFirstRequest.systemPrompt).toContain("code-review");
    expect(nextRunFirstRequest.systemPrompt).toContain("release");
    expect(nextRunFirstRequest.systemPrompt).not.toContain("CODE_REVIEW_BODY_SECRET");
    expect(nextRunFirstRequest.systemPrompt).not.toContain("RELEASE_BODY_SECRET");
    expect(loader.calls).toEqual(["code-review"]);
  });

  it("requires ContextRuntime when Skills are enabled", async () => {
    const cwd = await createWorkspace();
    const provider = new ProgressiveSkillsProvider();

    await expect(
      Agent.create({ provider, cwd, skills: {} })
    ).rejects.toThrow(/requires AgentOptions\.context/);
  });
});
