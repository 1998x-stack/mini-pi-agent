import { isAbsolute, relative, resolve, sep } from "node:path";
import { SkillPathError } from "./errors.js";
import type { SkillDescriptor } from "./types.js";

export interface ValidatedSkillPaths {
  root: string;
  manifestPath: string;
}

/** True when candidate is root itself or a descendant of root. */
export function isPathWithinRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

/**
 * Pure lexical validation for one discovered Skill descriptor.
 *
 * v0.4 package identity is intentionally strict: a descriptor must point to the
 * package's direct `<root>/SKILL.md`, not another file somewhere under root.
 */
export function validateSkillDescriptorPaths(
  descriptor: SkillDescriptor
): ValidatedSkillPaths {
  if (!isAbsolute(descriptor.root)) {
    throw new SkillPathError(
      "skill root must be absolute",
      descriptor.root,
      descriptor.manifestPath
    );
  }

  if (!isAbsolute(descriptor.manifestPath)) {
    throw new SkillPathError(
      "skill manifest path must be absolute",
      descriptor.root,
      descriptor.manifestPath
    );
  }

  const root = resolve(descriptor.root);
  const manifestPath = resolve(descriptor.manifestPath);

  if (!isPathWithinRoot(root, manifestPath)) {
    throw new SkillPathError(
      "skill manifest escapes package root",
      root,
      manifestPath
    );
  }

  const expectedManifestPath = resolve(root, "SKILL.md");
  if (manifestPath !== expectedManifestPath) {
    throw new SkillPathError(
      "skill manifest must be the package root SKILL.md",
      root,
      manifestPath
    );
  }

  return { root, manifestPath };
}
