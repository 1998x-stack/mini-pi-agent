import type { AgentMessage, ToolCall } from "../core/types.js";

export interface TokenEstimator {
  estimateText(text: string): number;
  estimateSystem(text: string): number;
  estimateMessage(message: AgentMessage): number;
  estimateMessages(messages: readonly AgentMessage[]): number;
}

export interface ApproximateTokenEstimatorOptions {
  charsPerToken?: number;
  systemOverhead?: number;
  messageOverhead?: number;
  toolCallOverhead?: number;
}

export class ApproximateTokenEstimator implements TokenEstimator {
  private readonly charsPerToken: number;
  private readonly systemOverhead: number;
  private readonly messageOverhead: number;
  private readonly toolCallOverhead: number;

  constructor(options: ApproximateTokenEstimatorOptions = {}) {
    this.charsPerToken = options.charsPerToken ?? 4;
    this.systemOverhead = options.systemOverhead ?? 4;
    this.messageOverhead = options.messageOverhead ?? 4;
    this.toolCallOverhead = options.toolCallOverhead ?? 6;

    if (!Number.isFinite(this.charsPerToken) || this.charsPerToken <= 0) {
      throw new Error(`charsPerToken must be > 0, got ${this.charsPerToken}`);
    }

    for (const [name, value] of [
      ["systemOverhead", this.systemOverhead],
      ["messageOverhead", this.messageOverhead],
      ["toolCallOverhead", this.toolCallOverhead]
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer, got ${value}`);
      }
    }
  }

  estimateText(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(Array.from(text).length / this.charsPerToken);
  }

  estimateSystem(text: string): number {
    return this.systemOverhead + this.estimateText(text);
  }

  estimateMessage(message: AgentMessage): number {
    let tokens = this.messageOverhead + this.estimateText(message.content);

    if (message.role === "assistant") {
      for (const call of message.toolCalls) {
        tokens += this.estimateToolCall(call);
      }
    } else if (message.role === "tool") {
      tokens += this.estimateText(message.toolName);
      tokens += this.estimateText(message.toolCallId);
    }

    return tokens;
  }

  estimateMessages(messages: readonly AgentMessage[]): number {
    return messages.reduce((total, message) => total + this.estimateMessage(message), 0);
  }

  private estimateToolCall(call: ToolCall): number {
    return (
      this.toolCallOverhead +
      this.estimateText(call.id) +
      this.estimateText(call.name) +
      this.estimateText(JSON.stringify(call.arguments))
    );
  }
}

export function estimatePreparedInput(
  estimator: TokenEstimator,
  systemPrompt: string,
  messages: readonly AgentMessage[]
): number {
  return estimator.estimateSystem(systemPrompt) + estimator.estimateMessages(messages);
}
