import { UnknownSkillError } from "./errors.js";
import type { SkillLoader } from "./loader.js";
import { normalizeSkillName, SkillRegistry } from "./registry.js";
import type { ActiveSkillStore } from "./active-store.js";
import type { LoadedSkill } from "./types.js";

export type SkillActivationStatus = "activated" | "already-active";

export interface SkillActivationResult {
  status: SkillActivationStatus;
  skill: LoadedSkill;
}

export interface SkillActivationServiceOptions {
  registry: SkillRegistry;
  loader: SkillLoader;
  activeStore: ActiveSkillStore;
}

/** Shared activation path for model-driven and future manual activation. */
export class SkillActivationService {
  private readonly registry: SkillRegistry;
  private readonly loader: SkillLoader;
  private readonly activeStore: ActiveSkillStore;

  constructor(options: SkillActivationServiceOptions) {
    this.registry = options.registry;
    this.loader = options.loader;
    this.activeStore = options.activeStore;
  }

  async activate(name: string, signal: AbortSignal): Promise<SkillActivationResult> {
    signal.throwIfAborted();
    const normalizedName = normalizeSkillName(name);

    const active = this.activeStore.get(normalizedName);
    if (active) {
      return { status: "already-active", skill: active };
    }

    const descriptor = this.registry.get(normalizedName);
    if (!descriptor) throw new UnknownSkillError(name);

    const loaded = await this.loader.load(descriptor, signal);
    signal.throwIfAborted();

    // Another activation may have committed while this load was in flight.
    const activatedWhileLoading = this.activeStore.get(normalizedName);
    if (activatedWhileLoading) {
      return { status: "already-active", skill: activatedWhileLoading };
    }

    const stored = this.activeStore.activate(loaded);
    return { status: "activated", skill: stored };
  }
}
