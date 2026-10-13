import { describe, expect, it } from "vitest";
import {
  createLoadedSkillSupplement,
  createSkillCatalogSupplement,
  renderSkillCatalog,
  skillSupplementId,
  type LoadedSkill,
  type SkillDescriptor
} from "../src/index.js";

function descriptor(name: string, description: string, pathSuffix: string): SkillDescriptor {
  return {
    name,
    description,
    root: `/workspace/.mini-pi/skills/${pathSuffix}`,
    manifestPath: `/workspace/.mini-pi/skills/${pathSuffix}/SKILL.md`,
    metadata: { owner: "private-owner" }
  };
}

describe("Skill catalog rendering", () => {
  it("renders a deterministic descriptor-only catalog", () => {
    const skills = [
      descriptor("Release", "Prepare a release.", "release"),
      descriptor("code-review", "Review code changes.", "code-review")
    ];
    const before = structuredClone(skills);

    const rendered = renderSkillCatalog(skills);

    expect(rendered).toBe(
      '<available_skills>\n{"name":"code-review","description":"Review code changes."}\n{"name":"Release","description":"Prepare a release."}\n</available_skills>'
    );
    expect(rendered).not.toContain("private-owner");
    expect(rendered).not.toContain("manifestPath");
    expect(rendered).not.toContain("/workspace/");
    expect(skills).toEqual(before);
  });

  it("uses JSON string escaping for catalog names and descriptions", () => {
    const rendered = renderSkillCatalog([
      descriptor('quote"skill', "Review <code> & report.", "quote")
    ]);

    expect(rendered).toContain('"name":"quote\\"skill"');
    expect(rendered).toContain('"description":"Review <code> & report."');
  });

  it("renders an explicit empty catalog", () => {
    expect(renderSkillCatalog([])).toBe("<available_skills />");
  });

  it("creates a required catalog supplement without Skill bodies", () => {
    const supplement = createSkillCatalogSupplement([
      descriptor("code-review", "Review code changes.", "code-review")
    ]);

    expect(supplement).toMatchObject({
      id: "skills:catalog",
      kind: "skill-catalog",
      required: true
    });
    expect(supplement.content).toContain("code-review");
    expect(supplement.content).not.toContain("# Workflow");
  });

  it("creates one active Skill supplement containing only the selected instructions", () => {
    const loaded: LoadedSkill = {
      descriptor: descriptor("code-review", "Review code changes.", "code-review"),
      instructions: "# Workflow\nInspect the diff."
    };

    const supplement = createLoadedSkillSupplement(loaded);

    expect(supplement).toEqual({
      id: "skill:name:code-review",
      kind: "active-skill",
      required: true,
      content: '<active_skill name="code-review">\n# Workflow\nInspect the diff.\n</active_skill>'
    });
  });

  it("creates valid deterministic ids for Skill names outside the readable id subset", () => {
    expect(skillSupplementId(" 数据分析 ")).toBe("skill:utf8hex:e695b0e68daee58886e69e90");
    expect(skillSupplementId("Code Review")).toBe("skill:utf8hex:636f646520726576696577");
  });
});
