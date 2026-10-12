import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Agent,
  JsonlSessionStore,
  MINI_PI_VERSION,
  PathOutsideRootError,
  ScriptedLLM,
  createEditTool,
  createReadTool,
  createWriteTool
} from "../dist/index.js";

const root = await mkdtemp(join(tmpdir(), "mini-pi-agent-"));
const sessionPath = join(root, "session.jsonl");

const agent = await Agent.create({
  provider: new ScriptedLLM([
    { content: "write", toolCalls: [{ name: "write", arguments: { path: "demo.txt", content: "hello" } }] },
    { content: "edit", toolCalls: [{ name: "edit", arguments: { path: "demo.txt", oldText: "hello", newText: "world" } }] },
    { content: "read", toolCalls: [{ name: "read", arguments: { path: "demo.txt" } }] },
    { content: "done" }
  ]),
  tools: [createReadTool(root), createWriteTool(root), createEditTool(root)],
  cwd: root,
  session: new JsonlSessionStore(sessionPath)
});

const result = await agent.prompt("Run the deterministic smoke test.");
const file = await readFile(join(root, "demo.txt"), "utf8");
const restored = await new JsonlSessionStore(sessionPath).load();

let traversalBlocked = false;
try {
  await createReadTool(root).execute(
    { path: "../outside.txt" },
    { cwd: root, signal: new AbortController().signal }
  );
} catch (error) {
  traversalBlocked = error instanceof PathOutsideRootError;
}

const report = {
  ok:
    result.turns === 4 &&
    result.finalMessage.content === "done" &&
    file === "world" &&
    restored.length === agent.state.messages.length &&
    traversalBlocked,
  version: MINI_PI_VERSION,
  turns: result.turns,
  messageRoles: restored.map((message) => message.role),
  file,
  traversalBlocked
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
