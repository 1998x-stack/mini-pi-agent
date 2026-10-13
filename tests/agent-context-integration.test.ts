import { describe, expect, it } from "vitest";
import {
  Agent,
  InMemorySummaryStore,
  KeepRecentContextPlanner,
  ProgressiveSummaryPolicy,
  type AgentEvent,
  type AgentMessage,
  type ContextSummarizer,
  type LLMProvider,
  type LLMRequest,
  type SessionStore,
  type TokenEstimator
} from "../src/index.js";

class FixedCostEstimator implements TokenEstimator {
  estimateText(text: string): number {
    return text.length === 0 ? 0 : 1;
  }

  estimateSystem(text: string): number {
    return text.includes("[mini-pi-agent context checkpoint]") ? 20 : 5;
  }

  estimateMessage(_message: AgentMessage): number {
    return 10;
  }

  estimateMessages(messages: readonly AgentMessage[]): number {
    return messages.length * 10;
  }
}

class TinySummarizer implements ContextSummarizer {
  async summarize(input: Parameters<ContextSummarizer["summarize"]>[0]) {
    return {
      content: `checkpoint:${input.startMessageIndex}..${input.endMessageIndex}`
    };
  }
}

class CapturingProvider implements LLMProvider {
  readonly id = "capturing";
  readonly requests: LLMRequest[] = [];

  async complete(request: LLMRequest) {
    this.requests.push(request);
    return {
      role: "assistant" as const,
      content: "done",
      toolCalls: [],
      timestamp: 999,
      model: this.id
    };
  }
}

class MemorySessionStore implements SessionStore {
  readonly appended: AgentMessage[] = [];

  constructor(private readonly initial: AgentMessage[]) {}

  async load(): Promise<AgentMessage[]> {
    return this.initial.map((message) => cloneMessage(message));
  }

  async append(message: AgentMessage): Promise<void> {
    this.appended.push(cloneMessage(message));
  }

  async clear(): Promise<void> {
    this.initial.length = 0;
    this.appended.length = 0;
  }
}

function cloneMessage(message: AgentMessage): AgentMessage {
  if (message.role === "assistant") {
    return {
      ...message,
      toolCalls: message.toolCalls.map((call) => ({
        ...call,
        arguments: structuredClone(call.arguments)
      }))
    };
  }
  return { ...message };
}

function historicalMessages(): AgentMessage[] {
  return [
    { role: "user", content: "u0", timestamp: 0 },
    { role: "assistant", content: "a1", toolCalls: [], timestamp: 1 },
    { role: "user", content: "u2", timestamp: 2 },
    { role: "assistant", content: "a3", toolCalls: [], timestamp: 3 },
    { role: "user", content: "u4", timestamp: 4 },
    { role: "assistant", content: "a5", toolCalls: [], timestamp: 5 }
  ];
}

describe("Agent v0.3 context integration", () => {
  it("sends summary + recent tail to the provider while preserving durable history", async () => {
    const estimator = new FixedCostEstimator();
    const summaryStore = new InMemorySummaryStore();
    const summaryPolicy = new ProgressiveSummaryPolicy({
      summarizer: new TinySummarizer(),
      store: summaryStore,
      estimator,
      idFactory: (() => {
        let id = 0;
        return () => `s${++id}`;
      })(),
      now: () => 123
    });
    const provider = new CapturingProvider();
    const initial = historicalMessages();
    const session = new MemorySessionStore(initial);
    const agent = await Agent.create({
      provider,
      session,
      systemPrompt: "base-system",
      context: {
        planner: new KeepRecentContextPlanner({ estimator }),
        budget: { contextWindow: 35, outputReserve: 0, safetyMargin: 0 },
        summaryStore,
        summaryPolicy
      }
    });
    const events: AgentEvent[] = [];
    agent.subscribe((event) => {
      events.push(event);
    });

    const result = await agent.prompt("latest-user");

    expect(result.finalMessage.content).toBe("done");
    expect(provider.requests).toHaveLength(1);

    const request = provider.requests[0];
    expect(request).toBeDefined();
    if (!request) throw new Error("expected provider request");

    expect(request.systemPrompt).toContain("[mini-pi-agent context checkpoint]");
    expect(request.systemPrompt).toContain("summary_id=s2");
    expect(request.systemPrompt).toContain("coverage=0..5");
    expect(request.messages.map((message) => message.content)).toEqual(["latest-user"]);

    const latestSummary = await summaryStore.getLatest();
    expect(latestSummary).toMatchObject({
      id: "s2",
      coversThroughMessageIndex: 5,
      content: "checkpoint:4..5"
    });

    expect(agent.state.messages).toHaveLength(initial.length + 2);
    expect(agent.state.messages.slice(0, initial.length)).toEqual(initial);
    expect(agent.state.messages.at(-2)?.content).toBe("latest-user");
    expect(agent.state.messages.at(-1)?.content).toBe("done");

    expect(session.appended).toHaveLength(2);
    expect(session.appended[0]?.content).toBe("latest-user");
    expect(session.appended[1]?.content).toBe("done");

    const contextEvents = events.filter((event) => event.type.startsWith("context_"));
    expect(contextEvents.map((event) => event.type)).toEqual([
      "context_prepare_start",
      "context_summary_advanced",
      "context_summary_advanced",
      "context_prepared"
    ]);

    const prepared = contextEvents.at(-1);
    expect(prepared?.type).toBe("context_prepared");
    if (prepared?.type !== "context_prepared") throw new Error("expected context_prepared");
    expect(prepared.compacted).toBe(true);
    expect(prepared.modelMessageCount).toBe(1);
    expect(prepared.summaryId).toBe("s2");
    expect(prepared.summaryCoverage).toBe(5);
    expect(prepared.durableTailStartMessageIndex).toBe(6);
  });

  it("keeps the legacy contextTransform path available when context is not configured", async () => {
    const provider = new CapturingProvider();
    const agent = await Agent.create({ provider, systemPrompt: "legacy" });

    await agent.prompt("hello");

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.systemPrompt).toBe("legacy");
    expect(provider.requests[0]?.messages.map((message) => message.content)).toEqual(["hello"]);
  });

  it("rejects configuring the v0.3 runtime and legacy transform simultaneously", async () => {
    const estimator = new FixedCostEstimator();
    const provider = new CapturingProvider();

    await expect(
      Agent.create({
        provider,
        context: {
          planner: new KeepRecentContextPlanner({ estimator }),
          budget: { contextWindow: 100, outputReserve: 0, safetyMargin: 0 }
        },
        contextTransform: {
          async transform(input) {
            return input;
          }
        }
      })
    ).rejects.toThrow(/mutually exclusive/);
  });
});
