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
