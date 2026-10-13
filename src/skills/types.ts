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
