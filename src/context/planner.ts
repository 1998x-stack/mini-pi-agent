import type { ContextPlannerInput, PreparedContext } from "./types.js";

export interface ContextPlanner {
  prepare(input: ContextPlannerInput): Promise<PreparedContext>;
}
