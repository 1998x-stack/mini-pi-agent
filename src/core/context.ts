import type { AgentMessage } from "./types.js";

export interface ContextTransformInput {
  systemPrompt: string;
  messages: readonly AgentMessage[];
}

export interface ContextTransformOutput {
  systemPrompt: string;
  messages: AgentMessage[];
}

export interface ContextTransform {
  transform(input: ContextTransformInput): Promise<ContextTransformOutput>;
}

export class IdentityContextTransform implements ContextTransform {
  async transform(input: ContextTransformInput): Promise<ContextTransformOutput> {
    return {
      systemPrompt: input.systemPrompt,
      messages: [...input.messages]
    };
  }
}

/**
 * Simple bounded context policy for learning purposes.
 * It preserves the newest messages and demonstrates where future summarization
 * or compaction belongs without coupling it to the Agent class.
 */
export class TailContextTransform implements ContextTransform {
  constructor(private readonly maxMessages: number) {
    if (maxMessages < 1) throw new Error("maxMessages must be >= 1");
  }

  async transform(input: ContextTransformInput): Promise<ContextTransformOutput> {
    return {
      systemPrompt: input.systemPrompt,
      messages: input.messages.slice(-this.maxMessages)
    };
  }
}
