import { UnknownSkillError } from "./errors.js";
import type {
  SkillActivationEvent,
  SkillActivationEventSink,
  SkillActivationOrigin
} from "./events.js";
import type { SkillLoader } from "./loader.js";
import { normalizeSkillName, SkillRegistry } from "./registry.js";
import type { ActiveSkillStore } from "./active-store.js";
import type { LoadedSkill, SkillDescriptor } from "./types.js";

export type SkillActivationStatus = "activated" | "already-active";

export interface SkillActivationResult {
  status: SkillActivationStatus;
  skill: LoadedSkill;
}

export interface SkillActivationRequestOptions {
  origin?: SkillActivationOrigin;
}

export interface SkillActivationServiceOptions {
  registry: SkillRegistry;
  loader: SkillLoader;
  activeStore: ActiveSkillStore;
  events?: SkillActivationEventSink;
}

function describeError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: "UnknownError", errorMessage: String(error) };
}

function metadata(skill: LoadedSkill): {
  name: string;
  normalizedName: string;
  manifestPath: string;
} {
  return {
    name: skill.descriptor.name,
    normalizedName: normalizeSkillName(skill.descriptor.name),
    manifestPath: skill.descriptor.manifestPath
  };
}

/** Shared activation path for model-driven and explicit/manual activation. */
export class SkillActivationService {
  private readonly registry: SkillRegistry;
  private readonly loader: SkillLoader;
  private readonly activeStore: ActiveSkillStore;
  private readonly events: SkillActivationEventSink | undefined;

  constructor(options: SkillActivationServiceOptions) {
    this.registry = options.registry;
    this.loader = options.loader;
    this.activeStore = options.activeStore;
    this.events = options.events;
  }

  async activate(
    name: string,
    signal: AbortSignal,
    options: SkillActivationRequestOptions = {}
  ): Promise<SkillActivationResult> {
    signal.throwIfAborted();
    const normalizedName = normalizeSkillName(name);
    const origin = options.origin ?? "api";
    await this.emit({
      type: "skill_activation_start",
      origin,
      requestedName: name,
      normalizedName
    });

    let descriptor: SkillDescriptor | undefined;

    try {
      const active = this.activeStore.get(normalizedName);
      if (active) {
        await this.emit({
          type: "skill_activation_reused",
          origin,
          ...metadata(active)
        });
        return { status: "already-active", skill: active };
      }

      descriptor = this.registry.get(normalizedName);
      if (!descriptor) throw new UnknownSkillError(name);

      const loaded = await this.loader.load(descriptor, signal);
      signal.throwIfAborted();

      // Another activation may have committed while this load was in flight.
      const activatedWhileLoading = this.activeStore.get(normalizedName);
      if (activatedWhileLoading) {
        await this.emit({
          type: "skill_activation_reused",
          origin,
          ...metadata(activatedWhileLoading)
        });
        return { status: "already-active", skill: activatedWhileLoading };
      }

      const stored = this.activeStore.activate(loaded);
      await this.emit({
        type: "skill_activated",
        origin,
        ...metadata(stored)
      });
      return { status: "activated", skill: stored };
    } catch (error) {
      const detail = describeError(error);
      await this.emit({
        type: "skill_activation_failed",
        origin,
        requestedName: name,
        normalizedName,
        ...(descriptor ? { manifestPath: descriptor.manifestPath } : {}),
        ...detail
      });
      throw error;
    }
  }

  private async emit(event: SkillActivationEvent): Promise<void> {
    if (!this.events) return;
    try {
      await this.events.emit(event);
    } catch {
      // Observation must never change activation semantics.
    }
  }
}
