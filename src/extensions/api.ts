import type { Tool } from "../core/tool.js";
import type { ToolRegistry } from "../core/tool-registry.js";
import { ExtensionApiClosedError } from "./errors.js";
import type {
  Disposable,
  HookHandler,
  HookName
} from "./hooks.js";
import type { HookPipeline } from "./pipeline.js";
import { ExtensionRegistrationSet } from "./registrations.js";
import { registerOwnedTool } from "./tool-registrations.js";

export interface ExtensionAPI {
  readonly extensionName: string;

  on<K extends HookName>(
    hook: K,
    handler: HookHandler<K>
  ): Disposable;

  registerTool(tool: Tool): Disposable;
}

/** Internal setup-scoped capability object. */
export class ScopedExtensionAPI implements ExtensionAPI {
  private open = true;

  constructor(
    readonly extensionName: string,
    private readonly pipeline: HookPipeline,
    private readonly tools: ToolRegistry,
    private readonly registrations: ExtensionRegistrationSet
  ) {}

  on<K extends HookName>(hook: K, handler: HookHandler<K>): Disposable {
    this.assertOpen();
    return this.registrations.add(
      this.pipeline.register({ extensionName: this.extensionName }, hook, handler)
    );
  }

  registerTool(tool: Tool): Disposable {
    this.assertOpen();
    return registerOwnedTool(this.tools, this.registrations, tool);
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
