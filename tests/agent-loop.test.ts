import { describe, expect, it } from "vitest";
import { Agent, ScriptedLLM, type Tool } from "../src/index.js";

const echoTool: Tool = {
  name: "echo",
  description: "Echo input",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  },
  async execute(args) {
    return { content: String(args.text) };
  }
};

describe("Agent loop", () => {
  it("feeds tool results back into the next turn", async () => {
    const agent = await Agent.create({
      provider: new ScriptedLLM([
        { content: "calling", toolCalls: [{ name: "echo", arguments: { text: "observation" } }] },
        { content: "done" }
      ]),
      tools: [echoTool]
    });

    const result = await agent.prompt("go");
    expect(result.finalMessage.content).toBe("done");
    expect(result.turns).toBe(2);
    expect(agent.state.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(agent.state.messages[2]?.role === "tool" && agent.state.messages[2].content).toBe("observation");
  });

  it("turns tool errors into observations instead of crashing the run", async () => {
    const agent = await Agent.create({
      provider: new ScriptedLLM([
        { toolCalls: [{ name: "missing", arguments: {} }] },
        { content: "Recovered from the tool error." }
      ])
    });

    const result = await agent.prompt("go");
    expect(result.finalMessage.content).toContain("Recovered");
    const toolMessage = agent.state.messages.find((m) => m.role === "tool");
    expect(toolMessage?.role === "tool" && toolMessage.isError).toBe(true);
  });
});
