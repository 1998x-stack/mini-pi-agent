import type { Tool, ToolExecutionContext, ToolResult } from "../core/tool.js";
import type { JsonValue } from "../core/types.js";
import { InvalidSkillActivationError } from "./errors.js";
import type { SkillActivationService } from "./activation-service.js";

export class LoadSkillTool implements Tool {
  readonly name = "load_skill";
  readonly description =
    "Activate one available Skill by name so its full instructions are available on the next model turn.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: {
        type: "string" as const,
        description: "Exact or case-insensitive Skill name from the available Skill catalog."
      }
    },
    required: ["name"],
    additionalProperties: false
  };

  private readonly activationService: SkillActivationService;

  constructor(activationService: SkillActivationService) {
    this.activationService = activationService;
  }

  async execute(
    args: Record<string, JsonValue>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const rawName = args.name;
    if (typeof rawName !== "string" || rawName.trim().length === 0) {
      throw new InvalidSkillActivationError("load_skill requires a non-empty string 'name'");
    }

    const result = await this.activationService.activate(rawName, context.signal, {
      origin: "tool"
    });
    const name = result.skill.descriptor.name;

    return {
      content:
        result.status === "activated"
          ? `Skill '${name}' activated.`
          : `Skill '${name}' is already active.`
    };
  }
}
