import type { HookName } from "./hooks.js";

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidHookRegistrationError extends ExtensionError {}

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
