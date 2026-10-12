import { isAbsolute, relative, resolve } from "node:path";
import { PathOutsideRootError } from "../core/errors.js";

export function resolveInsideRoot(root: string, requestedPath: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requestedPath);
  const rel = relative(absoluteRoot, target);

  if (rel === "") return target;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathOutsideRootError(`Path escapes tool root: ${requestedPath}`);
  }
  return target;
}
