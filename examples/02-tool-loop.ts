import { mkdir, writeFile } from "node:fs/promises";
import { Agent, ScriptedLLM, createReadTool } from "../src/index.js";

const workspace = ".sandbox/tool-loop";
await mkdir(workspace, { recursive: true });
await writeFile(`${workspace}/answer.txt`, "42\n", "utf8");

const agent = await Agent.create({
  provider: new ScriptedLLM([
    {
      content: "I should inspect the file first.",
      toolCalls: [{ name: "read", arguments: { path: "answer.txt" } }]
    },
    { content: "The file contains 42." }
  ]),
  tools: [createReadTool(workspace)],
  cwd: workspace
});

agent.subscribe((event) => {
  if (event.type === "tool_start") console.log("TOOL CALL:", event.call);
  if (event.type === "tool_end") console.log("OBSERVATION:", event.result.content.trim());
});

const result = await agent.prompt("What is inside answer.txt?");
console.log("FINAL:", result.finalMessage.content);
