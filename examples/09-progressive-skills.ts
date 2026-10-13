import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  ApproximateTokenEstimator,
  KeepRecentContextPlanner,
  type AssistantMessage,
  type LLMProvider,
  type LLMRequest
} from "../src/index.js";

class DemoProvider implements LLMProvider {
  readonly id = "progressive-skills-demo";
  private step = 0;

  async complete(request: LLMRequest): Promise<AssistantMessage> {
    console.log(`\n--- provider request ${this.step + 1} ---`);
    console.log(request.systemPrompt);

    const step = this.step++;
    if (step === 0) {
      return {
        role: "assistant",
        content: "I should load the code-review workflow first.",
        toolCalls: [
          {
            id: "load-code-review",
            name: "load_skill",
            arguments: { name: "code-review" }
          }
        ],
        timestamp: Date.now(),
        model: this.id
      };
    }

    return {
      role: "assistant",
      content: step === 1 ? "Review workflow loaded and applied." : "Fresh run, no Skill remains active.",
      toolCalls: [],
      timestamp: Date.now(),
      model: this.id
    };
  }
}

const cwd = await mkdtemp(join(tmpdir(), "mini-pi-skills-demo-"));

try {
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
      "Inspect the diff before making claims.",
      "Check behavior, edge cases, and regression risk."
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
      "Verify version metadata, changelog, tests, and artifacts."
    ].join("\n"),
    "utf8"
  );

  const estimator = new ApproximateTokenEstimator();
  const agent = await Agent.create({
    provider: new DemoProvider(),
    cwd,
    context: {
      planner: new KeepRecentContextPlanner({ estimator }),
      budget: {
        contextWindow: 32_000,
        outputReserve: 2_000,
        safetyMargin: 1_000
      }
    },
    skills: {}
  });

  agent.subscribe((event) => {
    if (event.type.startsWith("skill_")) {
      console.log("skill event:", event);
    }
  });

  console.log("\n=== run 1 ===");
  await agent.prompt("Review this change.");

  const activationResult = agent.state.messages.find(
    (message) => message.role === "tool" && message.toolName === "load_skill"
  );
  console.log("\ndurable load_skill result:", activationResult?.content);

  console.log("\n=== run 2 ===");
  await agent.prompt("What workflows are available now?");
} finally {
  await rm(cwd, { recursive: true, force: true });
}
