export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidSkillManifestError extends SkillError {
  readonly lineNumber: number | undefined;

  constructor(message: string, lineNumber?: number) {
    super(lineNumber === undefined ? message : `line ${lineNumber}: ${message}`);
    this.lineNumber = lineNumber;
  }
}

export class DuplicateSkillError extends SkillError {
  readonly normalizedName: string;
  readonly firstManifestPath: string;
  readonly secondManifestPath: string;

  constructor(normalizedName: string, firstManifestPath: string, secondManifestPath: string) {
    super(
      `duplicate skill '${normalizedName}' discovered at '${firstManifestPath}' and '${secondManifestPath}'`
    );
    this.normalizedName = normalizedName;
    this.firstManifestPath = firstManifestPath;
    this.secondManifestPath = secondManifestPath;
  }
}
