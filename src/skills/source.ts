import type { SkillDescriptor, SkillDiscoveryContext } from "./types.js";

export interface SkillSource {
  discover(context: SkillDiscoveryContext): Promise<SkillDescriptor[]>;
}
