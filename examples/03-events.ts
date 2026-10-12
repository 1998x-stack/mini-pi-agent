import { Agent, ScriptedLLM } from "../src/index.js";

const agent = await Agent.create({
  provider: new ScriptedLLM([{ content: "Streaming is a runtime/UI boundary." }], 5)
});

agent.subscribe((event) => {
  if (event.type === "text_delta") process.stdout.write(event.delta);
  if (event.type === "agent_end") process.stdout.write(`\n[done in ${event.turns} turn]\n`);
});

await agent.prompt("Explain streaming in one sentence.");
