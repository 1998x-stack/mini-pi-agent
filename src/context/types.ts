import type { AgentMessage } from "../core/types.js";
import type { ContextBudget, ResolvedContextBudget } from "./budget.js";

export interface ToolResultReductionProvenance {
  toolCallId: string;
  toolName: string;
  originalChars: number;
  visibleChars: number;
  omittedChars: number;
}

export interface ContextProvenance {
  sourceMessageCount: number;
  sourceUnitCount: number;
  selectedMessageCount: number;
  selectedUnitCount: number;
  omittedMessageCount: number;
  omittedUnitCount: number;
  selectedStartMessageIndex: number | null;
  reducedToolResults: ToolResultReductionProvenance[];
}

export interface PreparedContext {
  systemPrompt: string;
  messages: AgentMessage[];
  estimatedInputTokens: number;
  compacted: boolean;
  budget: ResolvedContextBudget;
  provenance: ContextProvenance;
}

export interface ContextPlannerInput {
  systemPrompt: string;
  history: readonly AgentMessage[];
  budget: ContextBudget;
  signal: AbortSignal;
}
