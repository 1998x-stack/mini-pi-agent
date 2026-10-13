import { normalizeSkillName } from "./registry.js";
import type { LoadedSkill, SkillDescriptor } from "./types.js";

function cloneDescriptor(descriptor: SkillDescriptor): SkillDescriptor {
  return {
    ...descriptor,
    ...(descriptor.metadata ? { metadata: { ...descriptor.metadata } } : {})
  };
}

export function cloneLoadedSkill(skill: LoadedSkill): LoadedSkill {
  return {
    descriptor: cloneDescriptor(skill.descriptor),
    instructions: skill.instructions
  };
}

function compareLoadedSkill(left: LoadedSkill, right: LoadedSkill): number {
  const leftName = normalizeSkillName(left.descriptor.name);
  const rightName = normalizeSkillName(right.descriptor.name);
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return 0;
}

export interface ActiveSkillStore {
  list(): readonly LoadedSkill[];
  get(name: string): LoadedSkill | undefined;
  activate(skill: LoadedSkill): LoadedSkill;
  clear(): void;
}

/** Reference run-scoped active Skill state. */
export class InMemoryActiveSkillStore implements ActiveSkillStore {
  private readonly byNormalizedName = new Map<string, LoadedSkill>();

  list(): readonly LoadedSkill[] {
    return [...this.byNormalizedName.values()]
      .sort(compareLoadedSkill)
      .map(cloneLoadedSkill);
  }

  get(name: string): LoadedSkill | undefined {
    const skill = this.byNormalizedName.get(normalizeSkillName(name));
    return skill ? cloneLoadedSkill(skill) : undefined;
  }

  activate(skill: LoadedSkill): LoadedSkill {
    const key = normalizeSkillName(skill.descriptor.name);
    const existing = this.byNormalizedName.get(key);
    if (existing) return cloneLoadedSkill(existing);

    const stored = cloneLoadedSkill(skill);
    this.byNormalizedName.set(key, stored);
    return cloneLoadedSkill(stored);
  }

  clear(): void {
    this.byNormalizedName.clear();
  }
}
