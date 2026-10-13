import { ContextRuntime, type ContextRuntimeOptions } from "../context/runtime.js";
import type { LLMProvider } from "../llm/types.js";
import type { SessionStore } from "../session/types.js";
import { runAgentLoop } from "./agent-loop.js";
import { IdentityContextTransform, type ContextTransform } from "./context.js";
import { EventBus, type AgentEventListener } from "./events.js";
import { MessageQueue } from "./queues.js";
import type { Tool } from "./tool.js";
import { ToolRegistry } from "./tool-registry.js";
import type { AgentRunResult, AgentState } from "./types.js";

export interface AgentOptions {
  provider: LLMProvider;
  systemPrompt?: string;
  tools?: readonly Tool[];
  cwd?: string;
  maxTurns?: number;
  session?: SessionStore;
  /** v0.3 model-context runtime. Mutually exclusive with legacy contextTransform. */
  context?: ContextRuntimeOptions;
  /** Legacy v0.1 teaching seam retained for compatibility. */
  contextTransform?: ContextTransform;
}

export class Agent {
  readonly state: AgentState;
  readonly tools: ToolRegistry;

  private readonly events = new EventBus();
  private readonly steering = new MessageQueue();
  private readonly followups = new MessageQueue();
  private activeController: AbortController | undefined;

  private constructor(
    private readonly options: {
      provider: LLMProvider;
      cwd: string;
      maxTurns: number;
      session: SessionStore | undefined;
      contextRuntime: ContextRuntime | undefined;
      contextTransform: ContextTransform;
    },
    state: AgentState,
    tools: ToolRegistry
  ) {
    this.state = state;
    this.tools = tools;
  }

  static async create(options: AgentOptions): Promise<Agent> {
    if (options.context && options.contextTransform) {
      throw new Error("AgentOptions.context and contextTransform are mutually exclusive");
    }

    const previousMessages = options.session ? await options.session.load() : [];
    const state: AgentState = {
      systemPrompt: options.systemPrompt ?? "You are a precise, helpful agent.",
      messages: previousMessages,
      running: false,
      runId: undefined,
      turn: 0
    };

    return new Agent(
      {
        provider: options.provider,
        cwd: options.cwd ?? process.cwd(),
        maxTurns: options.maxTurns ?? 24,
        session: options.session,
        contextRuntime: options.context ? new ContextRuntime(options.context) : undefined,
        contextTransform: options.contextTransform ?? new IdentityContextTransform()
      },
      state,
      new ToolRegistry(options.tools ?? [])
    );
  }

  subscribe(listener: AgentEventListener): () => void {
    return this.events.subscribe(listener);
  }

  steer(message: string): void {
    this.steering.push(message);
  }

  followUp(message: string): void {
    this.followups.push(message);
  }

  abort(reason = "Agent aborted by caller"): void {
    this.activeController?.abort(new Error(reason));
  }

  async prompt(input: string, signal?: AbortSignal): Promise<AgentRunResult> {
    const controller = new AbortController();
    this.activeController = controller;

    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) forwardAbort();
      else signal.addEventListener("abort", forwardAbort, { once: true });
    }

    try {
      return await runAgentLoop(
        this.state,
        input,
        {
          provider: this.options.provider,
          tools: this.tools,
          events: this.events,
          steering: this.steering,
          followups: this.followups,
          session: this.options.session,
          contextRuntime: this.options.contextRuntime,
          contextTransform: this.options.contextTransform,
          cwd: this.options.cwd,
          maxTurns: this.options.maxTurns
        },
        controller.signal
      );
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      this.activeController = undefined;
    }
  }
}
