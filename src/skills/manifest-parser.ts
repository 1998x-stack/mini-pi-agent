import { InvalidSkillManifestError } from "./errors.js";
import type { ParsedSkillDocument, SkillManifest } from "./types.js";

const FRONTMATTER_DELIMITER = "---";
const RESERVED_KEYS = new Set(["name", "description"]);
const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;

function normalizeSource(source: string): string {
  const withoutBom = source.startsWith("\uFEFF") ? source.slice(1) : source;
  return withoutBom.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function parseQuotedScalar(raw: string, lineNumber: number): string {
  const quote = raw[0];
  if (quote !== '"' && quote !== "'") return raw;

  if (raw.length < 2 || raw.at(-1) !== quote) {
    throw new InvalidSkillManifestError("unterminated quoted scalar", lineNumber);
  }

  const inner = raw.slice(1, -1);
  if (quote === "'") return inner.replaceAll("''", "'");

  try {
    return JSON.parse(raw) as string;
  } catch {
    throw new InvalidSkillManifestError("invalid double-quoted scalar", lineNumber);
  }
}

function parseScalar(raw: string, lineNumber: number): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new InvalidSkillManifestError("metadata value must not be empty", lineNumber);
  }

  if (
    value.startsWith("[") ||
    value.startsWith("{") ||
    value === "|" ||
    value === ">"
  ) {
    throw new InvalidSkillManifestError(
      "only single-line scalar frontmatter values are supported in v0.4",
      lineNumber
    );
  }

  return parseQuotedScalar(value, lineNumber);
}

function parseFrontmatter(lines: readonly string[]): SkillManifest {
  const values = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 2;
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    if (/^\s/.test(rawLine)) {
      throw new InvalidSkillManifestError(
        "nested or indented frontmatter is not supported in v0.4",
        lineNumber
      );
    }

    const colonIndex = rawLine.indexOf(":");
    if (colonIndex <= 0) {
      throw new InvalidSkillManifestError("expected 'key: value' frontmatter entry", lineNumber);
    }

    const key = rawLine.slice(0, colonIndex).trim();
    const rawValue = rawLine.slice(colonIndex + 1);

    if (!KEY_PATTERN.test(key)) {
      throw new InvalidSkillManifestError(`invalid metadata key '${key}'`, lineNumber);
    }

    if (values.has(key)) {
      const label = RESERVED_KEYS.has(key) ? "reserved frontmatter key" : "frontmatter key";
      throw new InvalidSkillManifestError(`duplicate ${label} '${key}'`, lineNumber);
    }

    values.set(key, parseScalar(rawValue, lineNumber));
  }

  const name = values.get("name")?.trim();
  if (!name) throw new InvalidSkillManifestError("required frontmatter key 'name' is missing or empty");

  const description = values.get("description")?.trim();
  if (!description) {
    throw new InvalidSkillManifestError(
      "required frontmatter key 'description' is missing or empty"
    );
  }

  const metadata = Object.fromEntries(
    [...values.entries()].filter(([key]) => !RESERVED_KEYS.has(key))
  );

  return {
    name,
    description,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
  };
}

/**
 * Parse the intentionally small v0.4 SKILL.md frontmatter subset.
 *
 * Supported frontmatter values are single-line scalars only. Discovery/loading
 * stays deterministic and dependency-free; richer YAML can be added later only
 * if the Skill contract genuinely needs it.
 */
export function parseSkillDocument(source: string): ParsedSkillDocument {
  const normalized = normalizeSource(source);
  const lines = normalized.split("\n");

  if (lines[0] !== FRONTMATTER_DELIMITER) {
    throw new InvalidSkillManifestError("SKILL.md must start with a '---' frontmatter delimiter", 1);
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === FRONTMATTER_DELIMITER
  );

  if (closingIndex < 0) {
    throw new InvalidSkillManifestError("SKILL.md frontmatter is missing its closing '---' delimiter");
  }

  const manifest = parseFrontmatter(lines.slice(1, closingIndex));
  const instructions = lines.slice(closingIndex + 1).join("\n").trim();

  if (instructions.length === 0) {
    throw new InvalidSkillManifestError("SKILL.md instructions body must not be empty");
  }

  return { manifest, instructions };
}
