import { Agent, ScriptedLLM } from "../src/index.js";

const agent = await Agent.create({
  provider: new ScriptedLLM([
    { content: "First I inspect.", toolCalls: [{ name: "noop", arguments: {} }] },
    { content: "I incorporated the steering message." },
    { content: "Follow-up finished." }
  ]),
  tools: [{
    name: "noop",
    description: "Do nothing.",
    inputSchema: { type: "object", additionalProperties: false },
    async execute() {
      agent.steer("New constraint: keep the answer short.");
      agent.followUp("After the main answer, confirm the queued follow-up mechanism.");
      return { content: "ok" };
    }
  }]
});

agent.subscribe((event) => {
  if (event.type === "steering_injected" || event.type === "followup_injected") console.log(event);
});

const result = await agent.prompt("Demonstrate queues.");
console.log(result.finalMessage.content);
