export type SkillActivationOrigin = "api" | "manual" | "tool";

export interface SkillEventMetadata {
  name: string;
  normalizedName: string;
  manifestPath?: string;
}

export type SkillActivationEvent =
  | {
      type: "skill_activation_start";
      origin: SkillActivationOrigin;
      requestedName: string;
      normalizedName: string;
    }
  | ({
      type: "skill_activated";
      origin: SkillActivationOrigin;
    } & SkillEventMetadata)
  | ({
      type: "skill_activation_reused";
      origin: SkillActivationOrigin;
    } & SkillEventMetadata)
  | {
      type: "skill_activation_failed";
      origin: SkillActivationOrigin;
      requestedName: string;
      normalizedName: string;
      manifestPath?: string;
      errorName: string;
      errorMessage: string;
    };

export type SkillActivationEventListener = (
  event: SkillActivationEvent
) => void | Promise<void>;

export interface SkillActivationEventSink {
  emit(event: SkillActivationEvent): Promise<void>;
}

/**
 * Metadata-only observational bus for Skill activation.
 *
 * Listener failures are isolated so telemetry cannot change activation behavior.
 * Full Skill instructions never appear in these events.
 */
export class SkillEventBus implements SkillActivationEventSink {
  private readonly listeners = new Set<SkillActivationEventListener>();

  subscribe(listener: SkillActivationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async emit(event: SkillActivationEvent): Promise<void> {
    await Promise.all(
      [...this.listeners].map(async (listener) => {
        try {
          await listener(event);
        } catch {
          // Observability must not change Skill activation semantics.
        }
      })
    );
  }
}
