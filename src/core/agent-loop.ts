import type { ContextRuntime } from "../context/runtime.js";
import type { ContextSupplement } from "../context/supplements.js";
import type { LLMProvider, LLMRequest, LLMStreamEvent } from "../llm/types.js";
import type { SessionStore } from "../session/types.js";
import { randomId } from "../utils/ids.js";
import { MaxTurnsExceededError } from "./errors.js";
import type { ContextTransform } from "./context.js";
import type { EventBus } from "./events.js";
import type { MessageQueue } from "./queues.js";
import type { ToolRegistry } from "./tool-registry.js";
import type {
  AgentMessage,
  AgentRunResult,
  AgentState,
  AssistantMessage,
  ToolResultMessage
} from "./types.js";

export interface AgentLoopDependencies {
  provider: LLMProvider;
  tools: ToolRegistry;
  events: EventBus;
  steering: MessageQueue;
  followups: MessageQueue;
  session: SessionStore | undefined;
  contextRuntime: ContextRuntime | undefined;
  contextSupplements?: () => readonly ContextSupplement[];
  contextTransform: ContextTransform;
  cwd: string;
  maxTurns: number;
}

export async function runAgentLoop(
  state: AgentState,
  input: string,
  deps: AgentLoopDependencies,
  signal: AbortSignal
): Promise<AgentRunResult> {
  if (state.running) throw new Error("Agent is already running");
  state.running = true;
  state.turn = 0;
  const runId = randomId("run");
  state.runId = runId;
  const initialMessageCount = state.messages.length;

  try {
    await deps.events.emit({ type: "agent_start", runId, input });
    await addMessage(state, { role: "user", content: input, timestamp: Date.now() }, runId, deps);

    while (state.turn < deps.maxTurns) {
      signal.throwIfAborted();
      state.turn += 1;
      const turn = state.turn;
      await deps.events.emit({ type: "turn_start", runId, turn });

      const modelContext = await prepareModelContext(state, deps, signal, runId, turn);
      const request: LLMRequest = {
        systemPrompt: modelContext.systemPrompt,
        messages: modelContext.messages,
        tools: deps.tools.list(),
        signal
      };

      const assistant = await getAssistantMessage(deps.provider, request, async (event) => {
        if (event.type === "text_delta") {
          await deps.events.emit({ type: "text_delta", runId, turn, delta: event.delta });
        }
      });

      await addMessage(state, assistant, runId, deps);
      await deps.events.emit({ type: "assistant_message", runId, turn, message: assistant });

      if (assistant.toolCalls.length > 0) {
        for (const call of assistant.toolCalls) {
          signal.throwIfAborted();
          await deps.events.emit({ type: "tool_start", runId, turn, call });
          let result: ToolResultMessage;
          try {
            const tool = deps.tools.get(call.name);
            deps.tools.validate(tool, call.arguments);
            const output = await tool.execute(call.arguments, { cwd: deps.cwd, signal });
            result = {
              role: "tool",
              toolCallId: call.id,
              toolName: call.name,
              content: output.content,
              isError: false,
              timestamp: Date.now()
            };
          } catch (error) {
            result = {
              role: "tool",
              toolCallId: call.id,
              toolName: call.name,
              content: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
              isError: true,
              timestamp: Date.now()
            };
          }
          await addMessage(state, result, runId, deps);
          await deps.events.emit({ type: "tool_end", runId, turn, result });
        }

        const steeringMessages = deps.steering.drain();
        if (steeringMessages.length) {
          for (const message of steeringMessages) await addMessage(state, message, runId, deps);
          await deps.events.emit({ type: "steering_injected", runId, count: steeringMessages.length });
        }

        await deps.events.emit({ type: "turn_end", runId, turn });
        continue;
      }

      const steeringMessages = deps.steering.drain();
      if (steeringMessages.length) {
        for (const message of steeringMessages) await addMessage(state, message, runId, deps);
        await deps.events.emit({ type: "steering_injected", runId, count: steeringMessages.length });
        await deps.events.emit({ type: "turn_end", runId, turn });
        continue;
      }

      const followupMessages = deps.followups.drain();
      if (followupMessages.length) {
        for (const message of followupMessages) await addMessage(state, message, runId, deps);
        await deps.events.emit({ type: "followup_injected", runId, count: followupMessages.length });
        await deps.events.emit({ type: "turn_end", runId, turn });
        continue;
      }

      await deps.events.emit({ type: "turn_end", runId, turn });
      await deps.events.emit({ type: "agent_end", runId, turns: turn });
      return {
        runId,
        finalMessage: assistant,
        turns: turn,
        messagesAdded: state.messages.length - initialMessageCount
      };
    }

    throw new MaxTurnsExceededError(`Agent exceeded maxTurns=${deps.maxTurns}`);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    await deps.events.emit({ type: "agent_error", runId, error: normalized });
    throw normalized;
  } finally {
    state.running = false;
    state.runId = undefined;
  }
}

async function prepareModelContext(
  state: AgentState,
  deps: AgentLoopDependencies,
  signal: AbortSignal,
  runId: string,
  turn: number
): Promise<{ systemPrompt: string; messages: readonly AgentMessage[] }> {
  if (!deps.contextRuntime) {
    return await deps.contextTransform.transform({
      systemPrompt: state.systemPrompt,
      messages: state.messages
    });
  }

  await deps.events.emit({
    type: "context_prepare_start",
    runId,
    turn,
    durableMessageCount: state.messages.length
  });

  const result = await deps.contextRuntime.prepare({
    systemPrompt: state.systemPrompt,
    history: state.messages,
    supplements: deps.contextSupplements?.() ?? [],
    signal
  });

  for (const advancement of result.summaryAdvances) {
    await deps.events.emit({
      type: "context_summary_advanced",
      runId,
      turn,
      summaryId: advancement.summaryId,
      previousCoverage: advancement.previousCoverage,
      nextCoverage: advancement.nextCoverage,
      newlyCoveredRange: { ...advancement.newlyCoveredRange }
    });
  }

  await deps.events.emit({
    type: "context_prepared",
    runId,
    turn,
    modelMessageCount: result.prepared.messages.length,
    estimatedInputTokens: result.prepared.estimatedInputTokens,
    compacted: result.prepared.compacted,
    durableTailStartMessageIndex: result.durableTailStartMessageIndex,
    omittedTailMessageCount: result.prepared.provenance.omittedMessageCount,
    reducedToolResultCount: result.prepared.provenance.reducedToolResults.length,
    ...(result.summary
      ? {
          summaryId: result.summary.id,
          summaryCoverage: result.summary.coversThroughMessageIndex
        }
      : {})
  });

  return {
    systemPrompt: result.prepared.systemPrompt,
    messages: result.prepared.messages
  };
}

async function addMessage(
  state: AgentState,
  message: AgentMessage,
  runId: string,
  deps: AgentLoopDependencies
): Promise<void> {
  state.messages.push(message);
  if (deps.session) await deps.session.append(message);
  await deps.events.emit({ type: "message_added", runId, message });
}

async function getAssistantMessage(
  provider: LLMProvider,
  request: LLMRequest,
  onStreamEvent: (event: LLMStreamEvent) => Promise<void>
): Promise<AssistantMessage> {
  if (!provider.stream) return await provider.complete(request);

  let finalMessage: AssistantMessage | undefined;
  for await (const event of provider.stream(request)) {
    await onStreamEvent(event);
    if (event.type === "done" && event.message) finalMessage = event.message;
  }
  if (!finalMessage) {
    throw new Error(`Streaming provider '${provider.id}' ended without a final message`);
  }
  return finalMessage;
}
