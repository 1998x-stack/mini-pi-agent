export {
  DuplicateExtensionError,
  ExtensionApiClosedError,
  ExtensionError,
  ExtensionHookError,
  ExtensionSetupError,
  InvalidExtensionDefinitionError,
  InvalidHookRegistrationError,
  UnknownExtensionError
} from "./errors.js";
export {
  type ExtensionAPI,
  ScopedExtensionAPI
} from "./api.js";
export {
  type AfterModelEvent,
  type AfterRunEvent,
  type AfterToolEvent,
  type AfterToolPipelineResult,
  type AfterToolTransformResult,
  type AfterTurnEvent,
  type BeforeModelEvent,
  type BeforeRunEvent,
  type BeforeToolDecision,
  type BeforeToolEvent,
  type BeforeToolPipelineResult,
  type ContextContributionPipelineResult,
  type ContextContributionResult,
  type Disposable,
  type HookContext,
  type HookEventMap,
  type HookHandler,
  type HookHandlerResultMap,
  type HookName,
  type HookPipelineResultMap,
  type HookRegistrationOwner,
  type RunStatus
} from "./hooks.js";
export {
  ExtensionHost,
  normalizeExtensionName,
  type ExtensionHostOptions
} from "./host.js";
export { HookPipeline } from "./pipeline.js";
export { ExtensionRegistrationSet } from "./registrations.js";
export {
  cloneLoadedExtension,
  type ExtensionDefinition,
  type LoadedExtension
} from "./types.js";
