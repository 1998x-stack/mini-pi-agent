import type { ContextSupplement } from "../context/supplements.js";
import {
  InMemoryActiveSkillStore,
  type ActiveSkillStore
} from "./active-store.js";
import { SkillActivationService } from "./activation-service.js";
import {
  createLoadedSkillSupplement,
  createSkillCatalogSupplement
} from "./catalog.js";
import { SkillEventBus } from "./events.js";
import {
  FilesystemSkillLoader,
  type SkillLoader
} from "./loader.js";
import { LoadSkillTool } from "./load-skill-tool.js";
import { ManualSkillActivator } from "./manual-activation.js";
import {
  ProjectSkillSource,
  type ProjectSkillSourceOptions
} from "./project-source.js";
import { SkillRegistry } from "./registry.js";
import type { SkillSource } from "./source.js";
import type { SkillDescriptor } from "./types.js";

export interface SkillRuntimeOptions {
  source?: SkillSource;
  loader?: SkillLoader;
  projectSource?: ProjectSkillSourceOptions;
}

export interface CreateSkillRuntimeInput extends SkillRuntimeOptions {
  cwd: string;
  signal: AbortSignal;
}

/**
 * Owns the Skills composition root for one Agent instance.
 *
 * Discovery/catalog state lives for the Agent lifetime. ActiveSkillStore is
 * explicitly cleared at run boundaries by Agent.prompt().
 */
export class SkillRuntime {
  readonly registry: SkillRegistry;
  readonly activeStore: ActiveSkillStore;
  readonly events: SkillEventBus;
  readonly activationService: SkillActivationService;
  readonly loadSkillTool: LoadSkillTool;
  readonly manual: ManualSkillActivator;

  private constructor(registry: SkillRegistry, loader: SkillLoader) {
    this.registry = registry;
    this.activeStore = new InMemoryActiveSkillStore();
    this.events = new SkillEventBus();
    this.activationService = new SkillActivationService({
      registry,
      loader,
      activeStore: this.activeStore,
      events: this.events
    });
    this.loadSkillTool = new LoadSkillTool(this.activationService);
    this.manual = new ManualSkillActivator(this.activationService);
  }

  static async create(input: CreateSkillRuntimeInput): Promise<SkillRuntime> {
    input.signal.throwIfAborted();
    const source =
      input.source ?? new ProjectSkillSource(input.projectSource);
    const loader = input.loader ?? new FilesystemSkillLoader();
    const descriptors = await source.discover({
      cwd: input.cwd,
      signal: input.signal
    });
    input.signal.throwIfAborted();
    return new SkillRuntime(new SkillRegistry(descriptors), loader);
  }

  descriptors(): readonly SkillDescriptor[] {
    return this.registry.list();
  }

  supplements(): readonly ContextSupplement[] {
    return [
      createSkillCatalogSupplement(this.registry.list()),
      ...this.activeStore.list().map(createLoadedSkillSupplement)
    ];
  }

  clearActive(): void {
    this.activeStore.clear();
  }
}
