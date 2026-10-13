export class ContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidContextBudgetError extends ContextError {}

export class ContextBudgetExceededError extends ContextError {
  readonly requiredTokens: number;
  readonly availableTokens: number;

  constructor(requiredTokens: number, availableTokens: number, label = "context") {
    super(`${label} requires ${requiredTokens} estimated tokens but only ${availableTokens} are available`);
    this.requiredTokens = requiredTokens;
    this.availableTokens = availableTokens;
  }
}

export class InvalidContextHistoryError extends ContextError {}

export class InvalidToolResultReductionOptionsError extends ContextError {}

export class InvalidContextSummaryError extends ContextError {}

export class SummaryCoverageRegressionError extends ContextError {
  readonly previousCoverage: number;
  readonly nextCoverage: number;

  constructor(previousCoverage: number, nextCoverage: number) {
    super(
      `summary coverage cannot move backward: previous=${previousCoverage}, next=${nextCoverage}`
    );
    this.previousCoverage = previousCoverage;
    this.nextCoverage = nextCoverage;
  }
}

export class InvalidSummaryCoverageBoundaryError extends ContextError {}

export class SummaryGenerationError extends ContextError {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
