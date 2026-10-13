import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilesystemSkillLoader,
  SkillIdentityMismatchError,
  SkillPathError,
  type SkillDescriptor
} from "../src/index.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mini-pi-skill-loader-"));
  cleanupPaths.push(root);
  return root;
}

function makeDescriptor(root: string, name = "code-review"): SkillDescriptor {
  return {
    name,
    description: "Review changes.",
    root,
    manifestPath: join(root, "SKILL.md"),
    metadata: { owner: "platform" }
  };
}

async function writeSkill(root: string, name = "code-review"): Promise<void> {
  await writeFile(
    join(root, "SKILL.md"),
    `---\nname: ${name}\ndescription: Review changes.\n---\n# Workflow\nInspect the diff.`,
    "utf8"
  );
}

describe("FilesystemSkillLoader", () => {
  it("loads exactly the requested SKILL.md body and clones the descriptor", async () => {
    const root = await createTempRoot();
    await writeSkill(root);
    await mkdir(join(root, "references"));
    await symlink(
      join(root, "does-not-exist.md"),
      join(root, "references", "broken-reference.md")
    );

    const descriptor = makeDescriptor(root);
    const before = structuredClone(descriptor);
    const loaded = await new FilesystemSkillLoader().load(
      descriptor,
      new AbortController().signal
    );

    expect(loaded.instructions).toBe("# Workflow\nInspect the diff.");
    expect(loaded.descriptor).toEqual(descriptor);
    expect(loaded.descriptor).not.toBe(descriptor);
    expect(loaded.descriptor.metadata).not.toBe(descriptor.metadata);
    expect(descriptor).toEqual(before);

    if (loaded.descriptor.metadata) loaded.descriptor.metadata.owner = "changed";
    expect(descriptor.metadata?.owner).toBe("platform");
  });

  it("rejects manifest identity drift after discovery", async () => {
    const root = await createTempRoot();
    await writeSkill(root, "release");

    await expect(
      new FilesystemSkillLoader().load(
        makeDescriptor(root, "code-review"),
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(SkillIdentityMismatchError);
  });

  it("accepts case-only identity differences because registry identity is normalized", async () => {
    const root = await createTempRoot();
    await writeSkill(root, "CODE-REVIEW");

    const loaded = await new FilesystemSkillLoader().load(
      makeDescriptor(root, "code-review"),
      new AbortController().signal
    );

    expect(loaded.instructions).toContain("Inspect the diff");
  });

  it("rejects a symlink manifest", async () => {
    const workspace = await createTempRoot();
    const root = join(workspace, "skill");
    await mkdir(root);
    const outside = join(workspace, "outside.md");
    await writeFile(
      outside,
      "---\nname: code-review\ndescription: Review changes.\n---\nbody",
      "utf8"
    );
    await symlink(outside, join(root, "SKILL.md"));

    await expect(
      new FilesystemSkillLoader().load(
        makeDescriptor(root),
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(SkillPathError);
  });

  it("rejects a symlink package root", async () => {
    const workspace = await createTempRoot();
    const actualRoot = join(workspace, "actual");
    const linkedRoot = join(workspace, "linked");
    await mkdir(actualRoot);
    await writeSkill(actualRoot);
    await symlink(actualRoot, linkedRoot, "dir");

    await expect(
      new FilesystemSkillLoader().load(
        makeDescriptor(linkedRoot),
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(SkillPathError);
  });

  it("propagates cancellation before filesystem loading", async () => {
    const root = await createTempRoot();
    await writeSkill(root);
    const controller = new AbortController();
    const reason = new Error("stop skill load");
    controller.abort(reason);

    await expect(
      new FilesystemSkillLoader().load(makeDescriptor(root), controller.signal)
    ).rejects.toBe(reason);
  });
});
