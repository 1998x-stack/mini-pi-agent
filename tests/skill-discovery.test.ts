import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidSkillManifestError,
  ProjectSkillSource
} from "../src/index.js";

async function withTempProject<T>(run: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "mini-pi-skills-"));
  try {
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function writeSkill(
  cwd: string,
  directory: string,
  manifest: string
): Promise<void> {
  const root = join(cwd, ".mini-pi", "skills", directory);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "SKILL.md"), manifest, "utf8");
}

function skillDocument(name: string, description: string, body = "Instructions."): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

describe("ProjectSkillSource", () => {
  it("returns an empty catalog when the project skill root does not exist", async () => {
    await withTempProject(async (cwd) => {
      const source = new ProjectSkillSource();
      const descriptors = await source.discover({
        cwd,
        signal: new AbortController().signal
      });

      expect(descriptors).toEqual([]);
    });
  });

  it("discovers one-level project Skill descriptors in deterministic directory order", async () => {
    await withTempProject(async (cwd) => {
      await writeSkill(cwd, "z-release", skillDocument("release", "Prepare a release."));
      await writeSkill(
        cwd,
        "a-review",
        `---\nname: code-review\ndescription: Review changes.\nowner: platform\n---\n# Review\nVery large instructions stay outside the descriptor.`
      );

      const source = new ProjectSkillSource();
      const descriptors = await source.discover({
        cwd,
        signal: new AbortController().signal
      });

      expect(descriptors.map((descriptor) => descriptor.name)).toEqual([
        "code-review",
        "release"
      ]);
      expect(descriptors[0]).toEqual({
        name: "code-review",
        description: "Review changes.",
        root: resolve(cwd, ".mini-pi/skills/a-review"),
        manifestPath: resolve(cwd, ".mini-pi/skills/a-review/SKILL.md"),
        metadata: { owner: "platform" }
      });
      expect("instructions" in (descriptors[0] ?? {})).toBe(false);
    });
  });

  it("ignores unrelated entries, packages without SKILL.md, and nested resources", async () => {
    await withTempProject(async (cwd) => {
      const catalogRoot = join(cwd, ".mini-pi", "skills");
      await mkdir(join(catalogRoot, "empty-package"), { recursive: true });
      await writeFile(join(catalogRoot, "README.md"), "not a skill", "utf8");

      await writeSkill(cwd, "code-review", skillDocument("code-review", "Review code."));
      await mkdir(join(catalogRoot, "code-review", "references"), { recursive: true });
      await writeFile(
        join(catalogRoot, "code-review", "references", "SKILL.md"),
        "this nested file must not be discovered",
        "utf8"
      );

      const descriptors = await new ProjectSkillSource().discover({
        cwd,
        signal: new AbortController().signal
      });

      expect(descriptors).toHaveLength(1);
      expect(descriptors[0]?.name).toBe("code-review");
    });
  });

  it("propagates invalid top-level SKILL.md manifests", async () => {
    await withTempProject(async (cwd) => {
      await writeSkill(cwd, "broken", "---\nname: broken\n---\nbody");

      await expect(
        new ProjectSkillSource().discover({
          cwd,
          signal: new AbortController().signal
        })
      ).rejects.toBeInstanceOf(InvalidSkillManifestError);
    });
  });

  it("propagates cancellation before discovery work begins", async () => {
    await withTempProject(async (cwd) => {
      const controller = new AbortController();
      const reason = new Error("stop discovery");
      controller.abort(reason);

      await expect(
        new ProjectSkillSource().discover({ cwd, signal: controller.signal })
      ).rejects.toBe(reason);
    });
  });
});
