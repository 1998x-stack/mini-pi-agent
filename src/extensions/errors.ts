import type { HookName } from "./hooks.js";

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidHookRegistrationError extends ExtensionError {}
export class InvalidExtensionDefinitionError extends ExtensionError {}
export class ExtensionApiClosedError extends ExtensionError {}

export class DuplicateExtensionError extends ExtensionError {
  readonly normalizedName: string;

  constructor(normalizedName: string) {
    super(`duplicate extension '${normalizedName}'`);
    this.normalizedName = normalizedName;
  }
}

export class UnknownExtensionError extends ExtensionError {
  readonly requestedName: string;

  constructor(requestedName: string) {
    super(`unknown extension '${requestedName}'`);
    this.requestedName = requestedName;
  }
}

export class ExtensionSetupError extends ExtensionError {
  readonly extensionName: string;
  override readonly cause: unknown;

  constructor(extensionName: string, cause: unknown) {
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`extension '${extensionName}' setup failed: ${detail}`);
    this.extensionName = extensionName;
    this.cause = cause;
  }
}

export class ExtensionHookError extends ExtensionError {
  readonly extensionName: string;
  readonly hook: HookName;
  override readonly cause: unknown;

  constructor(extensionName: string, hook: HookName, cause: unknown) {
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`extension '${extensionName}' failed in hook '${hook}': ${detail}`);
    this.extensionName = extensionName;
    this.hook = hook;
    this.cause = cause;
  }
}
