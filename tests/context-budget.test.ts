import { describe, expect, it } from "vitest";
import {
  ContextBudgetExceededError,
  InvalidContextBudgetError,
  assertWithinContextBudget,
  resolveContextBudget
} from "../src/index.js";

describe("ContextBudget", () => {
  it("derives the model input budget from context window and reserves", () => {
    expect(
      resolveContextBudget({
        contextWindow: 128_000,
        outputReserve: 12_000,
        safetyMargin: 4_000
      })
    ).toEqual({
      contextWindow: 128_000,
      outputReserve: 12_000,
      safetyMargin: 4_000,
      inputBudget: 112_000
    });
  });

  it("rejects invalid budgets before planning begins", () => {
    expect(() =>
      resolveContextBudget({ contextWindow: 0, outputReserve: 0, safetyMargin: 0 })
    ).toThrow(InvalidContextBudgetError);

    expect(() =>
      resolveContextBudget({ contextWindow: 100, outputReserve: 80, safetyMargin: 20 })
    ).toThrow(InvalidContextBudgetError);

    expect(() =>
      resolveContextBudget({ contextWindow: 100.5, outputReserve: 10, safetyMargin: 10 })
    ).toThrow(InvalidContextBudgetError);
  });

  it("reports required and available tokens when prepared input is too large", () => {
    const budget = resolveContextBudget({
      contextWindow: 100,
      outputReserve: 20,
      safetyMargin: 10
    });

    expect(() => assertWithinContextBudget(70, budget)).not.toThrow();

    try {
      assertWithinContextBudget(71, budget, "prepared context");
      throw new Error("expected ContextBudgetExceededError");
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetExceededError);
      expect((error as ContextBudgetExceededError).requiredTokens).toBe(71);
      expect((error as ContextBudgetExceededError).availableTokens).toBe(70);
      expect((error as Error).message).toContain("prepared context");
    }
  });
});
