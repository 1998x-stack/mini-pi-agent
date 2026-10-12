#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./core/agent.js";
import { OpenAICompatibleLLM } from "./llm/openai-compatible.js";
import { JsonlSessionStore } from "./session/jsonl-session.js";
import { createSafeFileTools } from "./tools/index.js";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) {
  console.error("Set OPENAI_API_KEY and OPENAI_MODEL first. See .env.example.");
  process.exit(1);
}

const cwd = process.cwd();
const providerOptions: ConstructorParameters<typeof OpenAICompatibleLLM>[0] = {
  apiKey,
  model
};
if (process.env.OPENAI_BASE_URL) providerOptions.baseUrl = process.env.OPENAI_BASE_URL;

const agent = await Agent.create({
  provider: new OpenAICompatibleLLM(providerOptions),
  systemPrompt: [
    "You are mini-pi, a small coding agent.",
    "Use tools when you need to inspect or modify files.",
    "Prefer small, verifiable changes."
  ].join("\n"),
  tools: createSafeFileTools(cwd),
  cwd,
  session: new JsonlSessionStore(`${cwd}/.sessions/default.jsonl`)
});

agent.subscribe((event) => {
  if (event.type === "tool_start") output.write(`\n[tool] ${event.call.name} ${JSON.stringify(event.call.arguments)}\n`);
  if (event.type === "tool_end") output.write(`[tool:${event.result.isError ? "error" : "ok"}] ${event.result.content.slice(0, 300)}\n`);
});

const rl = createInterface({ input, output });
console.log("mini-pi-agent v0.1 — /quit to exit, /clear to clear visible state only");

while (true) {
  const text = (await rl.question("\nYou> ")).trim();
  if (!text) continue;
  if (text === "/quit") break;
  if (text === "/clear") {
    agent.state.messages.splice(0);
    console.log("In-memory messages cleared. Session file is unchanged.");
    continue;
  }
  try {
    const result = await agent.prompt(text);
    console.log(`\nAgent> ${result.finalMessage.content}`);
  } catch (error) {
    console.error(error);
  }
}

rl.close();
