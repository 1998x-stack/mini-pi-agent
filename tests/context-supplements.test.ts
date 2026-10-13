import { describe, expect, it } from "vitest";
import {
  ContextBudgetExceededError,
  ContextRuntime,
  InMemorySummaryStore,
  InvalidContextSupplementError,
  KeepRecentContextPlanner,
  createContextSummary,
  normalizeContextSupplements,
  renderContextSupplements,
  type AgentMessage,
  type ContextSupplement,
  type TokenEstimator
} from "../src/index.js";

class CharacterEstimator implements TokenEstimator {
  estimateText(text: string): number {
    return text.length;
  }

  estimateSystem(text: string): number {
    return text.length;
  }

  estimateMessage(message: AgentMessage): number {
    return message.content.length;
  }

  estimateMessages(messages: readonly AgentMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateMessage(message), 0);
  }
}

function supplement(
  id: string,
  kind: ContextSupplement["kind"],
  content: string
): ContextSupplement {
  return { id, kind, content, required: true };
}

describe("Context supplements", () => {
  it("normalizes deterministically with catalog before active Skill bodies", () => {
    const input = [
      supplement("skill:name:zeta", "active-skill", "zeta body"),
      supplement("skills:catalog", "skill-catalog", "catalog"),
      supplement("skill:name:alpha", "active-skill", "alpha body")
    ];
    const before = structuredClone(input);

    expect(normalizeContextSupplements(input).map((item) => item.id)).toEqual([
      "skills:catalog",
      "skill:name:alpha",
      "skill:name:zeta"
    ]);
    expect(input).toEqual(before);
  });

  it("renders supplements as explicit model-only system sections", () => {
    const rendered = renderContextSupplements("base-system", [
      supplement("skill:name:review", "active-skill", "# Review\nInspect changes."),
      supplement("skills:catalog", "skill-catalog", "<available_skills />")
    ]);

    expect(rendered.startsWith("base-system\n")).toBe(true);
    expect(rendered.indexOf("id=skills:catalog")).toBeLessThan(
      rendered.indexOf("id=skill:name:review")
    );
    expect(rendered).toContain("kind=skill-catalog");
    expect(rendered).toContain("kind=active-skill");
  });

  it("rejects duplicate ids, empty content and invalid ids", () => {
    expect(() =>
      normalizeContextSupplements([
        supplement("skills:catalog", "skill-catalog", "a"),
        supplement("skills:catalog", "skill-catalog", "b")
      ])
    ).toThrow(InvalidContextSupplementError);

    expect(() =>
      normalizeContextSupplements([
        supplement("skill:name:empty", "active-skill", "   ")
      ])
    ).toThrow(/content/);

    expect(() =>
      normalizeContextSupplements([
        supplement("skill name with spaces", "active-skill", "body")
      ])
    ).toThrow(/id/);
  });

  it("accounts supplements inside ContextRuntime planning without mutating durable history", async () => {
    const estimator = new CharacterEstimator();
    const history: AgentMessage[] = [
      { role: "user", content: "hello", timestamp: 1 }
    ];
    const before = structuredClone(history);
    const runtime = new ContextRuntime({
      planner: new KeepRecentContextPlanner({ estimator }),
      budget: { contextWindow: 1000, outputReserve: 0, safetyMargin: 0 }
    });

    const result = await runtime.prepare({
      systemPrompt: "base",
      history,
      supplements: [supplement("skills:catalog", "skill-catalog", "CATALOG")],
      signal: new AbortController().signal
    });

    expect(result.prepared.systemPrompt).toContain("CATALOG");
    expect(result.prepared.messages).toEqual(history);
    expect(result.supplementIds).toEqual(["skills:catalog"]);
    expect(result.prepared.estimatedInputTokens).toBe(
      estimator.estimateSystem(result.prepared.systemPrompt) + estimator.estimateMessages(history)
    );
    expect(history).toEqual(before);
  });

  it("fails explicitly when mandatory supplement material makes the system prompt exceed budget", async () => {
    const estimator = new CharacterEstimator();
    const runtime = new ContextRuntime({
      planner: new KeepRecentContextPlanner({ estimator }),
      budget: { contextWindow: 80, outputReserve: 0, safetyMargin: 0 }
    });

    await expect(
      runtime.prepare({
        systemPrompt: "base",
        history: [],
        supplements: [
          supplement("skill:name:huge", "active-skill", "x".repeat(200))
        ],
        signal: new AbortController().signal
      })
    ).rejects.toBeInstanceOf(ContextBudgetExceededError);
  });

  it("renders summary checkpoint and supplements together without turning either into messages", async () => {
    const estimator = new CharacterEstimator();
    const store = new InMemorySummaryStore();
    await store.put(
      createContextSummary({
        id: "s1",
        content: "old-history-summary",
        coversThroughMessageIndex: 0,
        estimatedTokens: 10,
        createdAt: 1
      })
    );

    const history: AgentMessage[] = [
      { role: "user", content: "old", timestamp: 1 },
      { role: "user", content: "latest", timestamp: 2 }
    ];
    const runtime = new ContextRuntime({
      planner: new KeepRecentContextPlanner({ estimator }),
      budget: { contextWindow: 2000, outputReserve: 0, safetyMargin: 0 },
      summaryStore: store
    });

    const result = await runtime.prepare({
      systemPrompt: "base",
      history,
      supplements: [supplement("skills:catalog", "skill-catalog", "CATALOG")],
      signal: new AbortController().signal
    });

    expect(result.prepared.systemPrompt).toContain("old-history-summary");
    expect(result.prepared.systemPrompt).toContain("CATALOG");
    expect(result.prepared.systemPrompt.match(/old-history-summary/g)).toHaveLength(1);
    expect(result.prepared.systemPrompt.match(/CATALOG/g)).toHaveLength(1);
    expect(result.prepared.messages.map((message) => message.content)).toEqual(["latest"]);
    expect(result.durableTailStartMessageIndex).toBe(1);
  });
});
