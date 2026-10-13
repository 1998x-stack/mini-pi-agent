import { describe, expect, it } from "vitest";
import {
  DuplicateSkillError,
  SkillRegistry,
  normalizeSkillName,
  type SkillDescriptor
} from "../src/index.js";

function descriptor(
  name: string,
  manifestPath: string,
  overrides: Partial<SkillDescriptor> = {}
): SkillDescriptor {
  return {
    name,
    description: `${name} description`,
    root: manifestPath.replace(/\/SKILL\.md$/, ""),
    manifestPath,
    ...overrides
  };
}

describe("SkillRegistry", () => {
  it("normalizes names with trim + lowercase", () => {
    expect(normalizeSkillName("  Code-Review  ")).toBe("code-review");
  });

  it("stores descriptors in deterministic normalized-name order", () => {
    const registry = new SkillRegistry([
      descriptor("Release", "/skills/release/SKILL.md"),
      descriptor("code-review", "/skills/review/SKILL.md"),
      descriptor("incident", "/skills/incident/SKILL.md")
    ]);

    expect(registry.list().map((skill) => skill.name)).toEqual([
      "code-review",
      "incident",
      "Release"
    ]);
  });

  it("looks up names case-insensitively and ignores surrounding whitespace", () => {
    const registry = new SkillRegistry([
      descriptor("Code-Review", "/skills/review/SKILL.md")
    ]);

    expect(registry.get("code-review")?.name).toBe("Code-Review");
    expect(registry.get("  CODE-REVIEW ")?.name).toBe("Code-Review");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicate normalized names and preserves path provenance", () => {
    let captured: unknown;

    try {
      new SkillRegistry([
        descriptor("Code-Review", "/skills/a/SKILL.md"),
        descriptor(" code-review ", "/skills/b/SKILL.md")
      ]);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(DuplicateSkillError);
    if (!(captured instanceof DuplicateSkillError)) {
      throw new Error("expected DuplicateSkillError");
    }
    expect(captured.normalizedName).toBe("code-review");
    expect(captured.firstManifestPath).toBe("/skills/a/SKILL.md");
    expect(captured.secondManifestPath).toBe("/skills/b/SKILL.md");
  });

  it("clones descriptors and metadata on construction, list, and get", () => {
    const source = descriptor("review", "/skills/review/SKILL.md", {
      metadata: { owner: "platform" }
    });
    const registry = new SkillRegistry([source]);

    source.description = "mutated source";
    if (source.metadata) source.metadata.owner = "mutated";

    const firstList = registry.list();
    const first = firstList[0];
    expect(first).toMatchObject({
      description: "review description",
      metadata: { owner: "platform" }
    });

    if (!first) throw new Error("expected descriptor");
    first.description = "mutated returned descriptor";
    if (first.metadata) first.metadata.owner = "returned mutation";

    const second = registry.get("review");
    expect(second).toMatchObject({
      description: "review description",
      metadata: { owner: "platform" }
    });
    expect(second).not.toBe(first);
  });

  it("supports an empty catalog", () => {
    const registry = new SkillRegistry();
    expect(registry.list()).toEqual([]);
    expect(registry.get("anything")).toBeUndefined();
  });
});
