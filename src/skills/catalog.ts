import type { ContextSupplement } from "../context/supplements.js";
import { normalizeSkillName } from "./registry.js";
import type { LoadedSkill, SkillDescriptor } from "./types.js";

export const SKILL_CATALOG_SUPPLEMENT_ID = "skills:catalog";

function compareDescriptor(left: SkillDescriptor, right: SkillDescriptor): number {
  const leftName = normalizeSkillName(left.name);
  const rightName = normalizeSkillName(right.name);
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  if (left.manifestPath < right.manifestPath) return -1;
  if (left.manifestPath > right.manifestPath) return 1;
  return 0;
}

/**
 * Render only Level-0 Skill information. Paths, metadata and instructions are
 * deliberately excluded from the provider-visible catalog.
 */
export function renderSkillCatalog(descriptors: readonly SkillDescriptor[]): string {
  const ordered = [...descriptors].sort(compareDescriptor);
  if (ordered.length === 0) return "<available_skills />";

  const entries = ordered.map((descriptor) =>
    JSON.stringify({
      name: descriptor.name,
      description: descriptor.description
    })
  );

  return ["<available_skills>", ...entries, "</available_skills>"].join("\n");
}

export function createSkillCatalogSupplement(
  descriptors: readonly SkillDescriptor[]
): ContextSupplement {
  return {
    id: SKILL_CATALOG_SUPPLEMENT_ID,
    kind: "skill-catalog",
    content: renderSkillCatalog(descriptors),
    required: true
  };
}

export function createLoadedSkillSupplement(loaded: LoadedSkill): ContextSupplement {
  const normalizedName = normalizeSkillName(loaded.descriptor.name);
  const nameLiteral = JSON.stringify(loaded.descriptor.name);

  return {
    id: `skill:${normalizedName}`,
    kind: "active-skill",
    content: [
      `<active_skill name=${nameLiteral}>`,
      loaded.instructions,
      "</active_skill>"
    ].join("\n"),
    required: true
  };
}
