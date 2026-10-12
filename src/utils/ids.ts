import { randomUUID } from "node:crypto";

export function randomId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
