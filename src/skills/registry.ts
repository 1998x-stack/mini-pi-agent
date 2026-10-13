import { DuplicateSkillError } from "./errors.js";
import type { SkillDescriptor } from "./types.js";

export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

function cloneDescriptor(descriptor: SkillDescriptor): SkillDescriptor {
  return {
    ...descriptor,
    ...(descriptor.metadata ? { metadata: { ...descriptor.metadata } } : {})
  };
}

function compareDescriptor(left: SkillDescriptor, right: SkillDescriptor): number {
  const leftName = normalizeSkillName(left.name);
  const rightName = normalizeSkillName(right.name);
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  if (left.manifestPath < right.manifestPath) return -1;
  if (left.manifestPath > right.manifestPath) return 1;
  return 0;
}

/** Deterministic descriptor-only catalog. */
export class SkillRegistry {
  private readonly byNormalizedName = new Map<string, SkillDescriptor>();
  private readonly ordered: SkillDescriptor[];

  constructor(descriptors: readonly SkillDescriptor[] = []) {
    const ordered = descriptors.map(cloneDescriptor).sort(compareDescriptor);

    for (const descriptor of ordered) {
      const normalizedName = normalizeSkillName(descriptor.name);
      const existing = this.byNormalizedName.get(normalizedName);
      if (existing) {
        throw new DuplicateSkillError(
          normalizedName,
          existing.manifestPath,
          descriptor.manifestPath
        );
      }
      this.byNormalizedName.set(normalizedName, descriptor);
    }

    this.ordered = ordered;
  }

  list(): readonly SkillDescriptor[] {
    return this.ordered.map(cloneDescriptor);
  }

  get(name: string): SkillDescriptor | undefined {
    const descriptor = this.byNormalizedName.get(normalizeSkillName(name));
    return descriptor ? cloneDescriptor(descriptor) : undefined;
  }
}
