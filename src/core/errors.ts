export class MiniPiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MaxTurnsExceededError extends MiniPiError {}
export class UnknownToolError extends MiniPiError {}
export class ToolAlreadyRegisteredError extends MiniPiError {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Tool already registered: ${toolName}`);
    this.toolName = toolName;
  }
}
export class ToolValidationError extends MiniPiError {}
export class PathOutsideRootError extends MiniPiError {}
export class LLMProviderError extends MiniPiError {}
