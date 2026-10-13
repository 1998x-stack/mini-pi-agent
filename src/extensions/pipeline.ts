import type { ContextSupplement } from "../context/supplements.js";
import type { ToolCall, ToolResultMessage } from "../core/types.js";
import { ExtensionHookError, InvalidHookRegistrationError } from "./errors.js";
import type {
  AfterToolEvent,
  AfterToolPipelineResult,
  BeforeToolEvent,
  BeforeToolPipelineResult,
  ContextContributionPipelineResult,
  Disposable,
  HookContext,
  HookEventMap,
  HookHandler,
  HookHandlerResultMap,
  HookName,
  HookPipelineResultMap,
  HookRegistrationOwner
} from "./hooks.js";

interface StoredHookRegistration {
  readonly id: number;
  readonly owner: HookRegistrationOwner;
  readonly hook: HookName;
  readonly handler: unknown;
}

function cloneToolCall(call: ToolCall): ToolCall {
  return structuredClone(call);
}

function cloneToolResult(result: ToolResultMessage): ToolResultMessage {
  return structuredClone(result);
}

function cloneSupplement(supplement: ContextSupplement): ContextSupplement {
  return structuredClone(supplement);
}

function assertOwner(owner: HookRegistrationOwner): void {
  if (owner.extensionName.trim().length === 0) {
    throw new InvalidHookRegistrationError("hook registration owner must have a non-empty extensionName");
  }
}

/**
 * Deterministic sequential hook runner.
 *
 * Ordering is registration order. v0.5.1 deliberately has no numeric priority.
 * Handlers receive cloned events; only explicit return values affect the pipeline.
 */
export class HookPipeline {
  private readonly registrations: StoredHookRegistration[] = [];
  private nextRegistrationId = 1;

  register<K extends HookName>(
    owner: HookRegistrationOwner,
    hook: K,
    handler: HookHandler<K>
  ): Disposable {
    assertOwner(owner);
    const registration: StoredHookRegistration = {
      id: this.nextRegistrationId++,
      owner: { extensionName: owner.extensionName.trim() },
      hook,
      handler
    };
    this.registrations.push(registration);

    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        const index = this.registrations.findIndex((item) => item.id === registration.id);
        if (index >= 0) this.registrations.splice(index, 1);
      }
    };
  }

  async run<K extends HookName>(
    hook: K,
    event: HookEventMap[K],
    context: HookContext
  ): Promise<HookPipelineResultMap[K]> {
    context.signal.throwIfAborted();

    switch (hook) {
      case "before_run":
      case "before_model":
        return (await this.runContextContributions(hook, event, context)) as HookPipelineResultMap[K];
      case "before_tool":
        return (await this.runBeforeTool(event as BeforeToolEvent, context)) as HookPipelineResultMap[K];
      case "after_tool":
        return (await this.runAfterTool(event as AfterToolEvent, context)) as HookPipelineResultMap[K];
      case "after_model":
      case "after_turn":
      case "after_run":
        await this.runObserve(hook, event, context);
        return undefined as HookPipelineResultMap[K];
    }
  }

  private matching(hook: HookName): StoredHookRegistration[] {
    return this.registrations.filter((registration) => registration.hook === hook);
  }

  private async invoke<K extends HookName>(
    registration: StoredHookRegistration,
    hook: K,
    event: HookEventMap[K],
    context: HookContext
  ): Promise<HookHandlerResultMap[K]> {
    context.signal.throwIfAborted();
    const handler = registration.handler as HookHandler<K>;

    try {
      const result = await handler(structuredClone(event), context);
      context.signal.throwIfAborted();
      return result;
    } catch (error) {
      if (context.signal.aborted) context.signal.throwIfAborted();
      throw new ExtensionHookError(registration.owner.extensionName, hook, error);
    }
  }

  private async runContextContributions<K extends "before_run" | "before_model">(
    hook: K,
    event: HookEventMap[K],
    context: HookContext
  ): Promise<ContextContributionPipelineResult> {
    const supplements: ContextSupplement[] = [];

    for (const registration of this.matching(hook)) {
      const result = await this.invoke(registration, hook, event, context);
      if (result?.supplements) {
        supplements.push(...result.supplements.map(cloneSupplement));
      }
    }

    return { supplements };
  }

  private async runObserve<K extends "after_model" | "after_turn" | "after_run">(
    hook: K,
    event: HookEventMap[K],
    context: HookContext
  ): Promise<void> {
    for (const registration of this.matching(hook)) {
      await this.invoke(registration, hook, event, context);
    }
  }

  private async runBeforeTool(
    event: BeforeToolEvent,
    context: HookContext
  ): Promise<BeforeToolPipelineResult> {
    let currentCall = cloneToolCall(event.call);

    for (const registration of this.matching("before_tool")) {
      const decision = await this.invoke(
        registration,
        "before_tool",
        { ...event, call: cloneToolCall(currentCall) },
        context
      );

      if (decision === undefined || decision.action === "continue") continue;

      if (decision.action === "replace") {
        currentCall = {
          ...currentCall,
          arguments: structuredClone(decision.arguments)
        };
        continue;
      }

      if (decision.action === "block") {
        if (decision.reason.trim().length === 0) {
          throw new ExtensionHookError(
            registration.owner.extensionName,
            "before_tool",
            new Error("block decision requires a non-empty reason")
          );
        }
        return {
          action: "block",
          call: cloneToolCall(currentCall),
          reason: decision.reason,
          extensionName: registration.owner.extensionName
        };
      }
    }

    return { action: "continue", call: cloneToolCall(currentCall) };
  }

  private async runAfterTool(
    event: AfterToolEvent,
    context: HookContext
  ): Promise<AfterToolPipelineResult> {
    let currentResult = cloneToolResult(event.result);

    for (const registration of this.matching("after_tool")) {
      const result = await this.invoke(
        registration,
        "after_tool",
        {
          ...event,
          call: cloneToolCall(event.call),
          result: cloneToolResult(currentResult)
        },
        context
      );

      if (result?.result) currentResult = cloneToolResult(result.result);
    }

    return { result: cloneToolResult(currentResult) };
  }
}
