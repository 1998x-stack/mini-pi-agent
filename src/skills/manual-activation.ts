import type {
  SkillActivationResult,
  SkillActivationService
} from "./activation-service.js";

/** Thin explicit/manual activation surface over the shared activation service. */
export class ManualSkillActivator {
  private readonly service: SkillActivationService;

  constructor(service: SkillActivationService) {
    this.service = service;
  }

  activate(name: string, signal: AbortSignal): Promise<SkillActivationResult> {
    return this.service.activate(name, signal, { origin: "manual" });
  }
}
