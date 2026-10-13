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

export class SkillPathError extends SkillError {
  readonly root: string;
  readonly path: string;

  constructor(message: string, root: string, path: string) {
    super(`${message}: root='${root}', path='${path}'`);
    this.root = root;
    this.path = path;
  }
}

export class SkillIdentityMismatchError extends SkillError {
  readonly expectedName: string;
  readonly actualName: string;
  readonly manifestPath: string;

  constructor(expectedName: string, actualName: string, manifestPath: string) {
    super(
      `skill identity changed while loading '${manifestPath}': expected '${expectedName}', found '${actualName}'`
    );
    this.expectedName = expectedName;
    this.actualName = actualName;
    this.manifestPath = manifestPath;
  }
}

export class UnknownSkillError extends SkillError {
  readonly requestedName: string;

  constructor(requestedName: string) {
    super(`unknown skill '${requestedName}'`);
    this.requestedName = requestedName;
  }
}

export class InvalidSkillActivationError extends SkillError {}
