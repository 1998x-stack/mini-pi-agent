import { randomId } from "../utils/ids.js";
import { makeAssistantMessage, type LLMProvider, type LLMRequest, type ScriptedAssistantStep } from "./types.js";

/**
 * Deterministic provider for tests and learning examples.
 * Each model call consumes exactly one scripted step.
 */
export class ScriptedLLM implements LLMProvider {
  readonly id = "scripted";
  private cursor = 0;

  constructor(
    private readonly steps: readonly ScriptedAssistantStep[],
    private readonly streamChunkSize = 12
  ) {}

  async complete(_request: LLMRequest) {
    const step = this.nextStep();
    return this.toMessage(step);
  }

  async *stream(request: LLMRequest) {
    if (request.signal.aborted) throw request.signal.reason;
    const step = this.nextStep();
    const message = this.toMessage(step);

    for (let i = 0; i < message.content.length; i += this.streamChunkSize) {
      if (request.signal.aborted) throw request.signal.reason;
      yield { type: "text_delta" as const, delta: message.content.slice(i, i + this.streamChunkSize) };
      await Promise.resolve();
    }

    yield { type: "done" as const, message };
  }

  private nextStep(): ScriptedAssistantStep {
    const step = this.steps[this.cursor++];
    if (!step) throw new Error(`ScriptedLLM exhausted at call ${this.cursor}`);
    return step;
  }

  private toMessage(step: ScriptedAssistantStep) {
    return makeAssistantMessage(
      step.content ?? "",
      (step.toolCalls ?? []).map((call) => ({
        id: call.id ?? randomId("call"),
        name: call.name,
        arguments: call.arguments ?? {}
      })),
      this.id
    );
  }
}
