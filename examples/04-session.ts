import { rm } from "node:fs/promises";
import { Agent, JsonlSessionStore, ScriptedLLM } from "../src/index.js";

const path = ".sandbox/session/demo.jsonl";
await rm(path, { force: true });
const session = new JsonlSessionStore(path);

const first = await Agent.create({
  provider: new ScriptedLLM([{ content: "Saved." }]),
  session
});
await first.prompt("Remember: tool results are observations.");

const restored = await Agent.create({
  provider: new ScriptedLLM([{ content: "Restored session loaded." }]),
  session
});
console.log("Restored messages:", restored.state.messages.length);
