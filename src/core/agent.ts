import { ContextRuntime, type ContextRuntimeOptions } from "../context/runtime.js";
import type { LLMProvider } from "../llm/types.js";
import type { SessionStore } from "../session/types.js";
import {
  SkillRuntime,
  type SkillRuntimeOptions
} from "../skills/runtime.js";
import type { SkillActivationEvent } from "../skills/events.js";
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
  /** v0.4 project Skills. Requires `context` so Skill material is budget-accounted. */
  skills?: SkillRuntimeOptions;
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
      skillRuntime: SkillRuntime | undefined;
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
    if (options.skills && !options.context) {
      throw new Error("AgentOptions.skills requires AgentOptions.context so Skill material is budget-accounted");
    }

    const cwd = options.cwd ?? process.cwd();
    const previousMessages = options.session ? await options.session.load() : [];
    const state: AgentState = {
      systemPrompt: options.systemPrompt ?? "You are a precise, helpful agent.",
      messages: previousMessages,
      running: false,
      runId: undefined,
      turn: 0
    };

    const contextRuntime = options.context ? new ContextRuntime(options.context) : undefined;
    const skillRuntime = options.skills
      ? await SkillRuntime.create({
          cwd,
          signal: new AbortController().signal,
          ...options.skills
        })
      : undefined;

    const tools = new ToolRegistry(options.tools ?? []);
    if (skillRuntime) tools.register(skillRuntime.loadSkillTool);

    const agent = new Agent(
      {
        provider: options.provider,
        cwd,
        maxTurns: options.maxTurns ?? 24,
        session: options.session,
        contextRuntime,
        skillRuntime,
        contextTransform: options.contextTransform ?? new IdentityContextTransform()
      },
      state,
      tools
    );

    agent.bridgeSkillEvents();
    return agent;
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
    if (this.state.running) throw new Error("Agent is already running");
    this.options.skillRuntime?.clearActive();

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
          ...(this.options.skillRuntime
            ? { contextSupplements: () => this.options.skillRuntime!.supplements() }
            : {}),
          contextTransform: this.options.contextTransform,
          cwd: this.options.cwd,
          maxTurns: this.options.maxTurns
        },
        controller.signal
      );
    } finally {
      signal?.removeEventListener("abort", forwardAbort);
      this.options.skillRuntime?.clearActive();
      this.activeController = undefined;
    }
  }

  private bridgeSkillEvents(): void {
    const runtime = this.options.skillRuntime;
    if (!runtime) return;

    runtime.events.subscribe(async (event) => {
      const runId = this.state.runId;
      if (!runId) return;
      const turn = this.state.turn;
      await this.emitSkillEvent(event, runId, turn);
    });
  }

  private async emitSkillEvent(
    event: SkillActivationEvent,
    runId: string,
    turn: number
  ): Promise<void> {
    if (event.type === "skill_activation_start") {
      await this.events.emit({ ...event, runId, turn });
      return;
    }
    if (event.type === "skill_activated" || event.type === "skill_activation_reused") {
      await this.events.emit({ ...event, runId, turn });
      return;
    }
    await this.events.emit({ ...event, runId, turn });
  }
}
