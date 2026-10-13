import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import {
  SkillPathError,
  isPathWithinRoot,
  validateSkillDescriptorPaths,
  type SkillDescriptor
} from "../src/index.js";

function descriptor(root: string, manifestPath: string): SkillDescriptor {
  return {
    name: "code-review",
    description: "Review changes.",
    root,
    manifestPath
  };
}

describe("skill path validation", () => {
  it("accepts the direct root SKILL.md", () => {
    const root = resolve("tmp", "skills", "code-review");
    const manifestPath = join(root, "SKILL.md");

    expect(validateSkillDescriptorPaths(descriptor(root, manifestPath))).toEqual({
      root,
      manifestPath
    });
  });

  it("recognizes descendants without confusing '..'-prefixed names with traversal", () => {
    const root = resolve("tmp", "skills", "code-review");

    expect(isPathWithinRoot(root, join(root, "references", "checklist.md"))).toBe(true);
    expect(isPathWithinRoot(root, join(root, "..hidden"))).toBe(true);
    expect(isPathWithinRoot(root, resolve(root, "..", "release"))).toBe(false);
  });

  it("rejects relative roots and relative manifest paths", () => {
    expect(() =>
      validateSkillDescriptorPaths(descriptor("relative/root", "relative/root/SKILL.md"))
    ).toThrow(SkillPathError);

    const root = resolve("tmp", "skills", "code-review");
    expect(() =>
      validateSkillDescriptorPaths(descriptor(root, "SKILL.md"))
    ).toThrow(/manifest path must be absolute/);
  });

  it("rejects lexical root escape", () => {
    const root = resolve("tmp", "skills", "code-review");
    const escaped = resolve(root, "..", "release", "SKILL.md");

    expect(() => validateSkillDescriptorPaths(descriptor(root, escaped))).toThrow(
      /escapes package root/
    );
  });

  it("rejects another SKILL.md nested under the package root", () => {
    const root = resolve("tmp", "skills", "code-review");
    const nested = join(root, "references", "SKILL.md");

    expect(() => validateSkillDescriptorPaths(descriptor(root, nested))).toThrow(
      /package root SKILL.md/
    );
  });
});
