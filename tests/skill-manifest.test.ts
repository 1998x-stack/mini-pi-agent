import { describe, expect, it } from "vitest";
import { InvalidSkillManifestError, parseSkillDocument } from "../src/index.js";

describe("parseSkillDocument", () => {
  it("parses required fields and preserves the Markdown body", () => {
    const parsed = parseSkillDocument(`---
name: code-review
description: Review code changes for bugs and regressions.
---
# Code Review

1. Inspect the diff.
2. Report findings.`);

    expect(parsed.manifest).toEqual({
      name: "code-review",
      description: "Review code changes for bugs and regressions."
    });
    expect(parsed.instructions).toBe(
      "# Code Review\n\n1. Inspect the diff.\n2. Report findings."
    );
  });

  it("preserves unknown scalar frontmatter as metadata", () => {
    const parsed = parseSkillDocument(`---
name: release
description: Prepare a release.
owner: platform
stability: beta
---
Release workflow.`);

    expect(parsed.manifest.metadata).toEqual({
      owner: "platform",
      stability: "beta"
    });
  });

  it("supports quoted scalars, colons inside values, BOM and CRLF", () => {
    const parsed = parseSkillDocument(
      "\uFEFF---\r\nname: 'incident-debugging'\r\ndescription: \"Diagnose failures: logs, traces, and metrics.\"\r\nowner: 'SRE''s team'\r\n---\r\n# Diagnose\r\nInspect evidence.\r\n"
    );

    expect(parsed.manifest).toEqual({
      name: "incident-debugging",
      description: "Diagnose failures: logs, traces, and metrics.",
      metadata: { owner: "SRE's team" }
    });
    expect(parsed.instructions).toBe("# Diagnose\nInspect evidence.");
  });

  it("allows blank lines and comments inside frontmatter", () => {
    const parsed = parseSkillDocument(`---
# catalog metadata
name: testing

description: Run the right tests.
---
Testing instructions.`);

    expect(parsed.manifest.name).toBe("testing");
  });

  it.each([
    ["missing opening delimiter", "name: x\ndescription: y\n---\nbody", /must start/],
    ["missing closing delimiter", "---\nname: x\ndescription: y\nbody", /closing/],
    ["missing name", "---\ndescription: y\n---\nbody", /'name'/],
    ["missing description", "---\nname: x\n---\nbody", /'description'/],
    ["empty body", "---\nname: x\ndescription: y\n---\n", /body/],
    ["malformed entry", "---\nname: x\ndescription: y\nowner\n---\nbody", /key: value/],
    ["unsupported nested entry", "---\nname: x\ndescription: y\n  owner: team\n---\nbody", /indented/],
    ["unsupported list", "---\nname: x\ndescription: y\ntags: [a, b]\n---\nbody", /single-line scalar/]
  ])("rejects %s", (_label, source, expected) => {
    expect(() => parseSkillDocument(source)).toThrow(expected);
  });

  it("rejects duplicate reserved keys with line provenance", () => {
    let captured: unknown;

    try {
      parseSkillDocument(`---
name: first
name: second
description: Duplicate name.
---
body`);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(InvalidSkillManifestError);
    if (!(captured instanceof InvalidSkillManifestError)) {
      throw new Error("expected InvalidSkillManifestError");
    }
    expect(captured.lineNumber).toBe(3);
    expect(captured.message).toContain("duplicate reserved frontmatter key 'name'");
  });

  it("rejects duplicate custom metadata instead of silently choosing a winner", () => {
    expect(() =>
      parseSkillDocument(`---
name: x
description: y
owner: a
owner: b
---
body`)
    ).toThrow(/duplicate frontmatter key 'owner'/);
  });

  it("is deterministic and side-effect free for the same source", () => {
    const source = `---
name: code-review
description: Review changes.
owner: platform
---
# Workflow
Read the diff.`;

    const first = parseSkillDocument(source);
    const second = parseSkillDocument(source);

    expect(second).toEqual(first);
    expect(source).toContain("owner: platform");
  });
});
