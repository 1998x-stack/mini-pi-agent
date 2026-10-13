import type { ContextSupplement } from "../context/supplements.js";
import type {
  AssistantMessage,
  JsonValue,
  ToolCall,
  ToolResultMessage
} from "../core/types.js";

export type HookName =
  | "before_run"
  | "before_model"
  | "after_model"
  | "before_tool"
  | "after_tool"
  | "after_turn"
  | "after_run";

export type RunStatus = "completed" | "cancelled" | "failed";

export interface HookContext {
  readonly signal: AbortSignal;
}

export interface BeforeRunEvent {
  readonly runId: string;
  readonly input: string;
}

export interface BeforeModelEvent {
  readonly runId: string;
  readonly turn: number;
}

export interface AfterModelEvent {
  readonly runId: string;
  readonly turn: number;
  readonly message: AssistantMessage;
}

export interface BeforeToolEvent {
  readonly runId: string;
  readonly turn: number;
  readonly call: ToolCall;
}

export interface AfterToolEvent {
  readonly runId: string;
  readonly turn: number;
  readonly call: ToolCall;
  readonly result: ToolResultMessage;
}

export interface AfterTurnEvent {
  readonly runId: string;
  readonly turn: number;
}

export interface AfterRunEvent {
  readonly runId: string;
  readonly status: RunStatus;
}

export interface HookEventMap {
  before_run: BeforeRunEvent;
  before_model: BeforeModelEvent;
  after_model: AfterModelEvent;
  before_tool: BeforeToolEvent;
  after_tool: AfterToolEvent;
  after_turn: AfterTurnEvent;
  after_run: AfterRunEvent;
}

export interface ContextContributionResult {
  readonly supplements?: readonly ContextSupplement[];
}

export type BeforeToolDecision =
  | { readonly action: "continue" }
  | {
      readonly action: "replace";
      readonly arguments: Record<string, JsonValue>;
    }
  | {
      readonly action: "block";
      readonly reason: string;
    };

export interface AfterToolTransformResult {
  readonly result?: ToolResultMessage;
}

export interface HookHandlerResultMap {
  before_run: ContextContributionResult | void;
  before_model: ContextContributionResult | void;
  after_model: void;
  before_tool: BeforeToolDecision | void;
  after_tool: AfterToolTransformResult | void;
  after_turn: void;
  after_run: void;
}

export type HookHandler<K extends HookName> = (
  event: HookEventMap[K],
  context: HookContext
) => HookHandlerResultMap[K] | Promise<HookHandlerResultMap[K]>;

export interface Disposable {
  dispose(): void;
}

export interface HookRegistrationOwner {
  readonly extensionName: string;
}

export interface ContextContributionPipelineResult {
  readonly supplements: readonly ContextSupplement[];
}

export type BeforeToolPipelineResult =
  | {
      readonly action: "continue";
      readonly call: ToolCall;
    }
  | {
      readonly action: "block";
      readonly call: ToolCall;
      readonly reason: string;
      readonly extensionName: string;
    };

export interface AfterToolPipelineResult {
  readonly result: ToolResultMessage;
}

export interface HookPipelineResultMap {
  before_run: ContextContributionPipelineResult;
  before_model: ContextContributionPipelineResult;
  after_model: void;
  before_tool: BeforeToolPipelineResult;
  after_tool: AfterToolPipelineResult;
  after_turn: void;
  after_run: void;
}
