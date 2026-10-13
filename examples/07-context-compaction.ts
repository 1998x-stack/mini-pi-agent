import {
  Agent,
  DeterministicContextSummarizer,
  InMemorySummaryStore,
  KeepRecentContextPlanner,
  ProgressiveSummaryPolicy,
  type AgentMessage,
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

class InspectingProvider implements LLMProvider {
  readonly id = "context-inspector";

  async complete(request: LLMRequest) {
    console.log("\n=== MODEL-VISIBLE CONTEXT ===");
    console.log(`system has checkpoint: ${request.systemPrompt.includes("context checkpoint")}`);
    console.log(`model messages: ${request.messages.length}`);
    for (const message of request.messages) {
      console.log(`- ${message.role}: ${message.content}`);
    }

    return {
      role: "assistant" as const,
      content: "I received the compacted context.",
      toolCalls: [],
      timestamp: Date.now(),
      model: this.id
    };
  }
}

class MemorySession implements SessionStore {
  constructor(private readonly messages: AgentMessage[]) {}

  async load(): Promise<AgentMessage[]> {
    return this.messages.map((message) => ({ ...message })) as AgentMessage[];
  }

  async append(message: AgentMessage): Promise<void> {
    this.messages.push(message);
  }

  async clear(): Promise<void> {
    this.messages.length = 0;
  }
}

const historicalMessages: AgentMessage[] = [
  { role: "user", content: "old user 0", timestamp: 0 },
  { role: "assistant", content: "old assistant 1", toolCalls: [], timestamp: 1 },
  { role: "user", content: "old user 2", timestamp: 2 },
  { role: "assistant", content: "old assistant 3", toolCalls: [], timestamp: 3 },
  { role: "user", content: "old user 4", timestamp: 4 },
  { role: "assistant", content: "old assistant 5", toolCalls: [], timestamp: 5 }
];

const estimator = new FixedCostEstimator();
const summaryStore = new InMemorySummaryStore();
const summaryPolicy = new ProgressiveSummaryPolicy({
  summarizer: new DeterministicContextSummarizer({ maxMessageChars: 80 }),
  store: summaryStore,
  estimator
});

const agent = await Agent.create({
  provider: new InspectingProvider(),
  session: new MemorySession([...historicalMessages]),
  systemPrompt: "You are a precise coding agent.",
  context: {
    planner: new KeepRecentContextPlanner({ estimator }),
    budget: {
      contextWindow: 35,
      outputReserve: 0,
      safetyMargin: 0
    },
    summaryStore,
    summaryPolicy
  }
});

agent.subscribe((event) => {
  if (event.type === "context_summary_advanced") {
    console.log(
      `summary advanced: ${event.previousCoverage ?? "none"} -> ${event.nextCoverage}`
    );
  }
  if (event.type === "context_prepared") {
    console.log(
      `context prepared: durableTailStart=${event.durableTailStartMessageIndex}, modelMessages=${event.modelMessageCount}`
    );
  }
});

await agent.prompt("latest user request");

console.log("\n=== DURABLE STATE ===");
console.log(`durable messages: ${agent.state.messages.length}`);
console.log("durable history was not replaced by the summary checkpoint");

console.log("\n=== LATEST SUMMARY CHECKPOINT ===");
console.log(await summaryStore.getLatest());
