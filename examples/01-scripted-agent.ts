import { Agent, ScriptedLLM } from "../src/index.js";

const agent = await Agent.create({
  provider: new ScriptedLLM([
    { content: "The smallest useful agent is an LLM inside a feedback loop." }
  ]),
  systemPrompt: "Teach agent architecture with concise explanations."
});

const result = await agent.prompt("What is the core idea of an agent?");
console.log(result.finalMessage.content);
