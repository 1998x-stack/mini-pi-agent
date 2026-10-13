import type { ExtensionAPI } from "./api.js";

export interface ExtensionDefinition {
  readonly name: string;
  readonly version?: string;
  setup(api: ExtensionAPI): void | Promise<void>;
}

export interface LoadedExtension {
  readonly name: string;
  readonly normalizedName: string;
  readonly version?: string;
  readonly loadIndex: number;
}

export function cloneLoadedExtension(extension: LoadedExtension): LoadedExtension {
  return { ...extension };
}
