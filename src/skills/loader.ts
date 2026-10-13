import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SkillIdentityMismatchError,
  SkillPathError
} from "./errors.js";
import { parseSkillDocument } from "./manifest-parser.js";
import {
  isPathWithinRoot,
  validateSkillDescriptorPaths
} from "./paths.js";
import { normalizeSkillName } from "./registry.js";
import type { LoadedSkill, SkillDescriptor } from "./types.js";

export interface SkillLoader {
  load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill>;
}

function cloneDescriptor(descriptor: SkillDescriptor): SkillDescriptor {
  return {
    ...descriptor,
    ...(descriptor.metadata ? { metadata: { ...descriptor.metadata } } : {})
  };
}

/**
 * Loads exactly one selected SKILL.md after lexical and canonical path checks.
 * Optional references/scripts/assets are deliberately not traversed here.
 */
export class FilesystemSkillLoader implements SkillLoader {
  async load(descriptor: SkillDescriptor, signal: AbortSignal): Promise<LoadedSkill> {
    signal.throwIfAborted();

    const { root, manifestPath } = validateSkillDescriptorPaths(descriptor);

    const rootStat = await lstat(root);
    signal.throwIfAborted();
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new SkillPathError(
        "skill root must be a real directory, not a symlink or other file type",
        root,
        root
      );
    }

    const manifestStat = await lstat(manifestPath);
    signal.throwIfAborted();
    if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
      throw new SkillPathError(
        "skill manifest must be a real regular file, not a symlink or other file type",
        root,
        manifestPath
      );
    }

    const [canonicalRoot, canonicalManifest] = await Promise.all([
      realpath(root),
      realpath(manifestPath)
    ]);
    signal.throwIfAborted();

    if (!isPathWithinRoot(canonicalRoot, canonicalManifest)) {
      throw new SkillPathError(
        "canonical skill manifest escapes canonical package root",
        canonicalRoot,
        canonicalManifest
      );
    }

    const expectedCanonicalManifest = resolve(canonicalRoot, "SKILL.md");
    if (canonicalManifest !== expectedCanonicalManifest) {
      throw new SkillPathError(
        "canonical skill manifest is not the package root SKILL.md",
        canonicalRoot,
        canonicalManifest
      );
    }

    const source = await readFile(manifestPath, {
      encoding: "utf8",
      signal
    });
    signal.throwIfAborted();

    const parsed = parseSkillDocument(source);
    if (normalizeSkillName(parsed.manifest.name) !== normalizeSkillName(descriptor.name)) {
      throw new SkillIdentityMismatchError(
        descriptor.name,
        parsed.manifest.name,
        manifestPath
      );
    }

    return {
      descriptor: cloneDescriptor(descriptor),
      instructions: parsed.instructions
    };
  }
}
