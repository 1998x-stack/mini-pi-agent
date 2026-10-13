import type { AgentMessage } from "../core/types.js";
import type { ContextSummary } from "./summary.js";

export interface ContextSummarizerInput {
  previousSummary?: ContextSummary;
  messages: readonly AgentMessage[];
  startMessageIndex: number;
  endMessageIndex: number;
  signal: AbortSignal;
}

export interface ContextSummarizerResult {
  content: string;
}

export interface ContextSummarizer {
  summarize(input: ContextSummarizerInput): Promise<ContextSummarizerResult>;
}

export interface DeterministicContextSummarizerOptions {
  maxMessageChars?: number;
  maxPreviousSummaryChars?: number;
}

interface ResolvedDeterministicOptions {
  maxMessageChars: number;
  maxPreviousSummaryChars: number;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("context summarization aborted");
}

function truncateCodePoints(value: string, maxChars: number): string {
  const points = Array.from(value);
  if (points.length <= maxChars) return value;
  return `${points.slice(0, maxChars).join("")}…`;
}

function renderMessage(message: AgentMessage, index: number, maxChars: number): string {
  const content = truncateCodePoints(message.content.replaceAll("\n", "\\n"), maxChars);

  if (message.role === "user") {
    return `- [${index}] user: ${content}`;
  }

  if (message.role === "tool") {
    const status = message.isError ? "error" : "ok";
    return `- [${index}] tool ${message.toolName}#${message.toolCallId} ${status}: ${content}`;
  }

  const calls = message.toolCalls.length === 0
    ? ""
    : ` | tool_calls=${message.toolCalls.map((call) => `${call.name}#${call.id}`).join(",")}`;
  return `- [${index}] assistant: ${content}${calls}`;
}

/**
 * Deterministic offline reference summarizer.
 *
 * It is intentionally simple: the class exists to prove progressive-checkpoint
 * mechanics without requiring a network model. Production callers can provide a
 * semantic LLM-backed ContextSummarizer without changing the policy contract.
 */
export class DeterministicContextSummarizer implements ContextSummarizer {
  readonly options: ResolvedDeterministicOptions;

  constructor(options: DeterministicContextSummarizerOptions = {}) {
    const resolved: ResolvedDeterministicOptions = {
      maxMessageChars: options.maxMessageChars ?? 240,
      maxPreviousSummaryChars: options.maxPreviousSummaryChars ?? 2_000
    };
    assertPositiveInteger("maxMessageChars", resolved.maxMessageChars);
    assertPositiveInteger("maxPreviousSummaryChars", resolved.maxPreviousSummaryChars);
    this.options = resolved;
  }

  async summarize(input: ContextSummarizerInput): Promise<ContextSummarizerResult> {
    throwIfAborted(input.signal);

    const lines: string[] = [
      "[mini-pi-agent deterministic context summary]",
      `new_history_range=${input.startMessageIndex}..${input.endMessageIndex}`
    ];

    if (input.previousSummary) {
      lines.push(
        `previous_checkpoint_id=${input.previousSummary.id}`,
        `previous_coverage=0..${input.previousSummary.coversThroughMessageIndex}`,
        "",
        "Previous checkpoint:",
        truncateCodePoints(input.previousSummary.content, this.options.maxPreviousSummaryChars)
      );
    } else {
      lines.push("previous_checkpoint=none");
    }

    lines.push("", "New durable history:");
    input.messages.forEach((message, offset) => {
      throwIfAborted(input.signal);
      lines.push(
        renderMessage(
          message,
          input.startMessageIndex + offset,
          this.options.maxMessageChars
        )
      );
    });

    throwIfAborted(input.signal);
    return { content: lines.join("\n") };
  }
}
