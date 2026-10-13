export interface SkillManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}

/** Parsed representation of one SKILL.md document. */
export interface ParsedSkillDocument {
  manifest: SkillManifest;
  /** Markdown body after the frontmatter block. */
  instructions: string;
}

/** Cheap discovery-time representation of a Skill package. */
export interface SkillDescriptor {
  name: string;
  description: string;
  /** Absolute package root that contains SKILL.md and optional resources. */
  root: string;
  /** Absolute path to the package SKILL.md file. */
  manifestPath: string;
  metadata?: Record<string, string>;
}

/** Full Level-1 representation created only for one explicitly selected Skill. */
export interface LoadedSkill {
  descriptor: SkillDescriptor;
  instructions: string;
}

export interface SkillDiscoveryContext {
  cwd: string;
  signal: AbortSignal;
}
