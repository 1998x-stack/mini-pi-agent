export class MiniPiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MaxTurnsExceededError extends MiniPiError {}
export class UnknownToolError extends MiniPiError {}
export class ToolValidationError extends MiniPiError {}
export class PathOutsideRootError extends MiniPiError {}
export class LLMProviderError extends MiniPiError {}
