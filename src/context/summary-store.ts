import { SummaryCoverageRegressionError } from "./errors.js";
import {
  assertValidContextSummary,
  cloneContextSummary,
  type ContextSummary
} from "./summary.js";

export interface SummaryStore {
  getLatest(): Promise<ContextSummary | undefined>;
  put(summary: ContextSummary): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Minimal deterministic reference store for v0.3.
 *
 * It intentionally stores checkpoint artifacts separately from durable agent
 * messages. Later implementations may persist the same contract to disk or DB.
 */
export class InMemorySummaryStore implements SummaryStore {
  private latest: ContextSummary | undefined;

  async getLatest(): Promise<ContextSummary | undefined> {
    return this.latest ? cloneContextSummary(this.latest) : undefined;
  }

  async put(summary: ContextSummary): Promise<void> {
    assertValidContextSummary(summary);

    if (
      this.latest !== undefined &&
      summary.coversThroughMessageIndex < this.latest.coversThroughMessageIndex
    ) {
      throw new SummaryCoverageRegressionError(
        this.latest.coversThroughMessageIndex,
        summary.coversThroughMessageIndex
      );
    }

    this.latest = cloneContextSummary(summary);
  }

  async clear(): Promise<void> {
    this.latest = undefined;
  }
}
