import { ToolRegistry } from "../core/tool-registry.js";
import {
  DuplicateExtensionError,
  ExtensionSetupError,
  InvalidExtensionDefinitionError,
  UnknownExtensionError
} from "./errors.js";
import { ScopedExtensionAPI } from "./api.js";
import type { HookPipeline } from "./pipeline.js";
import { ExtensionRegistrationSet } from "./registrations.js";
import {
  cloneLoadedExtension,
  type ExtensionDefinition,
  type LoadedExtension
} from "./types.js";

interface LoadedExtensionRecord {
  readonly descriptor: LoadedExtension;
  readonly registrations: ExtensionRegistrationSet;
}

export interface ExtensionHostOptions {
  pipeline: HookPipeline;
  /**
   * Tool registry shared with the runtime. A private registry is created when
   * omitted so hook-only v0.5.2 callers remain valid.
   */
  tools?: ToolRegistry;
}

export function normalizeExtensionName(name: string): string {
  return name.trim().toLowerCase();
}

function validateDefinition(extension: ExtensionDefinition): {
  name: string;
  normalizedName: string;
  version: string | undefined;
} {
  const name = extension.name.trim();
  if (name.length === 0) {
    throw new InvalidExtensionDefinitionError("extension name must be non-empty");
  }
  if (typeof extension.setup !== "function") {
    throw new InvalidExtensionDefinitionError(`extension '${name}' must define setup(api)`);
  }

  const version = extension.version?.trim();
  if (extension.version !== undefined && version?.length === 0) {
    throw new InvalidExtensionDefinitionError(
      `extension '${name}' version must be non-empty when provided`
    );
  }

  return {
    name,
    normalizedName: normalizeExtensionName(name),
    version
  };
}

/**
 * Deterministic owner for Extension setup and owned registrations.
 *
 * Host operations are serialized so async setup completion order cannot change
 * extension load order, hook registration order, or tool ownership semantics.
 */
export class ExtensionHost {
  private readonly pipeline: HookPipeline;
  private readonly tools: ToolRegistry;
  private readonly records: LoadedExtensionRecord[] = [];
  private operationTail: Promise<void> = Promise.resolve();
  private nextLoadIndex = 0;

  constructor(options: ExtensionHostOptions) {
    this.pipeline = options.pipeline;
    this.tools = options.tools ?? new ToolRegistry();
  }

  load(extension: ExtensionDefinition): Promise<LoadedExtension> {
    return this.enqueue(() => this.loadNow(extension));
  }

  unload(name: string): Promise<void> {
    return this.enqueue(() => this.unloadNow(name));
  }

  list(): readonly LoadedExtension[] {
    return this.records.map((record) => cloneLoadedExtension(record.descriptor));
  }

  get(name: string): LoadedExtension | undefined {
    const normalizedName = normalizeExtensionName(name);
    const record = this.records.find(
      (candidate) => candidate.descriptor.normalizedName === normalizedName
    );
    return record ? cloneLoadedExtension(record.descriptor) : undefined;
  }

  private async loadNow(extension: ExtensionDefinition): Promise<LoadedExtension> {
    const identity = validateDefinition(extension);
    if (this.records.some(
      (record) => record.descriptor.normalizedName === identity.normalizedName
    )) {
      throw new DuplicateExtensionError(identity.normalizedName);
    }

    const registrations = new ExtensionRegistrationSet();
    const api = new ScopedExtensionAPI(
      identity.name,
      this.pipeline,
      this.tools,
      registrations
    );

    try {
      await extension.setup(api);
      api.close();
    } catch (error) {
      api.close();
      registrations.dispose();
      throw new ExtensionSetupError(identity.name, error);
    }

    const descriptor: LoadedExtension = {
      name: identity.name,
      normalizedName: identity.normalizedName,
      ...(identity.version === undefined ? {} : { version: identity.version }),
      loadIndex: this.nextLoadIndex++
    };
    this.records.push({ descriptor, registrations });
    return cloneLoadedExtension(descriptor);
  }

  private async unloadNow(name: string): Promise<void> {
    const normalizedName = normalizeExtensionName(name);
    const index = this.records.findIndex(
      (record) => record.descriptor.normalizedName === normalizedName
    );
    if (index < 0) throw new UnknownExtensionError(name);

    const [record] = this.records.splice(index, 1);
    record!.registrations.dispose();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
