import { ExtensionApiClosedError } from "./errors.js";
import type {
  Disposable,
  HookHandler,
  HookName
} from "./hooks.js";
import type { HookPipeline } from "./pipeline.js";
import { ExtensionRegistrationSet } from "./registrations.js";

export interface ExtensionAPI {
  readonly extensionName: string;

  on<K extends HookName>(
    hook: K,
    handler: HookHandler<K>
  ): Disposable;
}

/** Internal setup-scoped capability object. */
export class ScopedExtensionAPI implements ExtensionAPI {
  private open = true;

  constructor(
    readonly extensionName: string,
    private readonly pipeline: HookPipeline,
    private readonly registrations: ExtensionRegistrationSet
  ) {}

  on<K extends HookName>(hook: K, handler: HookHandler<K>): Disposable {
    this.assertOpen();
    return this.registrations.add(
      this.pipeline.register({ extensionName: this.extensionName }, hook, handler)
    );
  }

  close(): void {
    this.open = false;
  }

  private assertOpen(): void {
    if (!this.open) {
      throw new ExtensionApiClosedError(
        `extension '${this.extensionName}' setup API is closed`
      );
    }
  }
}
