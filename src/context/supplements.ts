import { InvalidContextSupplementError } from "./errors.js";

export type ContextSupplementKind = "skill-catalog" | "active-skill";

/**
 * Ephemeral model-context material that is not part of durable AgentMessage history.
 *
 * v0.4.4 treats every supplied supplement as mandatory model-visible material.
 * `required` is kept as explicit policy metadata for later selection strategies.
 */
export interface ContextSupplement {
  id: string;
  kind: ContextSupplementKind;
  content: string;
  required: boolean;
}

const SUPPLEMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const VALID_KINDS = new Set<ContextSupplementKind>(["skill-catalog", "active-skill"]);

function cloneSupplement(supplement: ContextSupplement): ContextSupplement {
  return { ...supplement };
}

function compareSupplement(left: ContextSupplement, right: ContextSupplement): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function normalizeContextSupplements(
  supplements: readonly ContextSupplement[]
): ContextSupplement[] {
  const seen = new Set<string>();
  const normalized = supplements.map((supplement) => {
    const id = supplement.id.trim();
    if (!SUPPLEMENT_ID_PATTERN.test(id)) {
      throw new InvalidContextSupplementError(
        `context supplement id '${supplement.id}' must match ${SUPPLEMENT_ID_PATTERN}`
      );
    }

    if (!VALID_KINDS.has(supplement.kind)) {
      throw new InvalidContextSupplementError(
        `unsupported context supplement kind '${String(supplement.kind)}'`
      );
    }

    if (supplement.content.trim().length === 0) {
      throw new InvalidContextSupplementError(`context supplement '${id}' content must not be empty`);
    }

    if (seen.has(id)) {
      throw new InvalidContextSupplementError(`duplicate context supplement id '${id}'`);
    }
    seen.add(id);

    return {
      id,
      kind: supplement.kind,
      content: supplement.content,
      required: supplement.required
    };
  });

  return normalized.sort(compareSupplement).map(cloneSupplement);
}

/**
 * Render supplements into the system material *before* ContextPlanner budgeting.
 * No supplement is silently dropped by the v0.4.4 reference runtime.
 */
export function renderContextSupplements(
  baseSystemPrompt: string,
  supplements: readonly ContextSupplement[]
): string {
  const normalized = normalizeContextSupplements(supplements);
  if (normalized.length === 0) return baseSystemPrompt;

  const sections = normalized.map((supplement) =>
    [
      "[mini-pi-agent context supplement]",
      `id=${supplement.id}`,
      `kind=${supplement.kind}`,
      `required=${supplement.required}`,
      "",
      supplement.content,
      "[/mini-pi-agent context supplement]"
    ].join("\n")
  );

  return [baseSystemPrompt, "", ...sections].join("\n");
}
