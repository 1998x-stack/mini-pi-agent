import { ContextBudgetExceededError, InvalidContextBudgetError } from "./errors.js";

export interface ContextBudget {
  contextWindow: number;
  outputReserve: number;
  safetyMargin: number;
}

export interface ResolvedContextBudget extends ContextBudget {
  inputBudget: number;
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidContextBudgetError(`${name} must be a non-negative integer, got ${value}`);
  }
}

export function resolveContextBudget(budget: ContextBudget): ResolvedContextBudget {
  assertNonNegativeInteger("contextWindow", budget.contextWindow);
  assertNonNegativeInteger("outputReserve", budget.outputReserve);
  assertNonNegativeInteger("safetyMargin", budget.safetyMargin);

  if (budget.contextWindow === 0) {
    throw new InvalidContextBudgetError("contextWindow must be greater than 0");
  }

  const inputBudget = budget.contextWindow - budget.outputReserve - budget.safetyMargin;
  if (inputBudget <= 0) {
    throw new InvalidContextBudgetError(
      `outputReserve + safetyMargin must leave a positive input budget; resolved inputBudget=${inputBudget}`
    );
  }

  return { ...budget, inputBudget };
}

export function assertWithinContextBudget(
  estimatedInputTokens: number,
  budget: ResolvedContextBudget,
  label = "context"
): void {
  assertNonNegativeInteger("estimatedInputTokens", estimatedInputTokens);
  if (estimatedInputTokens > budget.inputBudget) {
    throw new ContextBudgetExceededError(estimatedInputTokens, budget.inputBudget, label);
  }
}
