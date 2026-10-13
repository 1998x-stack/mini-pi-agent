import type { Dirent, Stats } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseSkillDocument } from "./manifest-parser.js";
import type { SkillSource } from "./source.js";
import type { SkillDescriptor, SkillDiscoveryContext } from "./types.js";

export interface ProjectSkillSourceOptions {
  relativeRoot?: string;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Discovers project-local Skill packages from:
 *
 *   <cwd>/.mini-pi/skills/*/SKILL.md
 *
 * Discovery returns descriptor metadata only. Optional package resources are
 * not traversed or executed, and symlink package directories are ignored.
 */
export class ProjectSkillSource implements SkillSource {
  private readonly relativeRoot: string;

  constructor(options: ProjectSkillSourceOptions = {}) {
    this.relativeRoot = options.relativeRoot ?? ".mini-pi/skills";
  }

  async discover(context: SkillDiscoveryContext): Promise<SkillDescriptor[]> {
    context.signal.throwIfAborted();
    const catalogRoot = resolve(context.cwd, this.relativeRoot);

    let entries: Dirent[];
    try {
      entries = await readdir(catalogRoot, { withFileTypes: true });
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return [];
      throw error;
    }

    context.signal.throwIfAborted();
    entries.sort((left, right) => compareText(left.name, right.name));

    const descriptors: SkillDescriptor[] = [];

    for (const entry of entries) {
      context.signal.throwIfAborted();
      if (!entry.isDirectory()) continue;

      const root = join(catalogRoot, entry.name);
      const manifestPath = join(root, "SKILL.md");

      let manifestStat: Stats;
      try {
        manifestStat = await lstat(manifestPath);
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") continue;
        throw error;
      }

      if (!manifestStat.isFile()) continue;

      const source = await readFile(manifestPath, {
        encoding: "utf8",
        signal: context.signal
      });
      const parsed = parseSkillDocument(source);
      const metadata = parsed.manifest.metadata
        ? { ...parsed.manifest.metadata }
        : undefined;

      descriptors.push({
        name: parsed.manifest.name,
        description: parsed.manifest.description,
        root,
        manifestPath,
        ...(metadata ? { metadata } : {})
      });
    }

    context.signal.throwIfAborted();
    return descriptors;
  }
}
