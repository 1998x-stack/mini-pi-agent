# mini-pi-agent

A small, extensible **Pi-style Agent Runtime** written from first principles in TypeScript.

The goal is not to clone every Pi feature. The goal is to make the smallest architecture that lets you **see the agent loop clearly**, run it, test it, and evolve it version by version.

## 1. The core mental model

```text
User
  ↓
messages.push(user)
  ↓
LLM(messages, tools)
  ├──────────── no tool calls ───────────► final answer
  │
  └──────────── tool calls
                    ↓
               execute tools
                    ↓
               tool results
                    └────────────────────► LLM again
```

The irreducible runtime is:

```ts
while (true) {
  const assistant = await llm(messages, tools);
  messages.push(assistant);

  if (assistant.toolCalls.length === 0) return assistant;

  for (const call of assistant.toolCalls) {
    const observation = await execute(call);
    messages.push(observation);
  }
}
```

Everything else is runtime engineering around this loop.

## 2. What v0.1 contains

- stateful `Agent`
- standalone `runAgentLoop()`
- provider-neutral `LLMProvider`
- deterministic `ScriptedLLM`
- OpenAI-compatible provider adapter
- `Tool` + `ToolRegistry`
- `read`, `write`, `edit`
- opt-in `shell`
- lifecycle event bus
- text-delta event seam
- abort/cancellation
- steering queue
- follow-up queue
- JSONL session persistence
- context-transform interface
- tests and runnable examples

The code is intentionally structured enough to grow, while keeping the actual feedback loop readable in one file.

## 3. Project structure

```text
mini-pi-agent/
├── Agents.md                 mandatory development contract
├── Plan.md                   canonical version/architecture roadmap
├── version.md                current integrated version snapshot
├── src/
│   ├── core/
│   │   ├── agent.ts          stateful facade
│   │   ├── agent-loop.ts     ⭐ runtime loop
│   │   ├── context.ts
│   │   ├── events.ts
│   │   ├── queues.ts
│   │   ├── tool.ts
│   │   ├── tool-registry.ts
│   │   └── types.ts
│   ├── llm/
│   ├── session/
│   ├── tools/
│   ├── utils/
│   ├── cli.ts
│   └── index.ts
├── examples/
├── tests/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── EXTENSION-POINTS.md
│   ├── LEARNING-PATH.md
│   ├── ROADMAP.md            compact pointer to Plan.md
│   └── versions/
└── package.json
```

## 4. Start here

```bash
npm install
npm run check
npm run demo
```

Then run examples individually:

```bash
npx tsx examples/01-scripted-agent.ts
npx tsx examples/02-tool-loop.ts
npx tsx examples/03-events.ts
npx tsx examples/04-session.ts
npx tsx examples/05-steering-followup.ts
```

## 5. Run with a real model

```bash
export OPENAI_API_KEY="..."
export OPENAI_MODEL="..."
export OPENAI_BASE_URL="https://api.openai.com/v1"  # optional
npm run dev
```

`OpenAICompatibleLLM` uses a common `/chat/completions` function-calling shape so provider adaptation stays outside `Agent`.

## 6. Recommended learning order

Read:

1. `Agents.md`
2. `Plan.md`
3. `version.md`
4. `src/core/types.ts`
5. `src/core/tool.ts`
6. `src/llm/types.ts`
7. `src/core/agent-loop.ts` ⭐
8. `src/core/agent.ts`
9. `src/core/events.ts`
10. `src/session/jsonl-session.ts`
11. `src/core/context.ts`

Do **not** start with the CLI.

## 7. Key architecture boundaries

### LLM != Agent

The model produces text and tool-call intentions. The runtime owns execution.

```text
LLM: call read(path=package.json)
             ↓
        Agent Runtime
             ↓
       real filesystem
```

### Tool = schema + executor

```ts
interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  execute(args, context): Promise<ToolResult>;
}
```

The schema is exposed to the model; the executor touches the environment.

### AgentMessage != provider message

Runtime state stays provider-neutral. Provider adapters serialize it to their own wire format.

### Events separate runtime from UI

```text
agent_start
turn_start
text_delta
assistant_message
tool_start
tool_end
turn_end
agent_end
```

CLI, TUI, web, logging, debugging, and future RPC clients can consume the same runtime events.

### Session is append-only

The first persistence model is JSONL:

```text
user
assistant(tool call)
tool result
assistant
...
```

This is easy to inspect and naturally prepares the design for future branching/checkpoints.

## 8. Tool safety

File tools are rooted to a configured workspace and reject path escape.

The shell tool is deliberately **opt-in**. A later version will introduce permission and sandbox policy rather than pretending unrestricted shell execution is safe by default.

## 9. Version strategy

```text
v0.1  core feedback loop                     implemented
v0.2  streaming + ToolScheduler               next
v0.3  context budget + compaction              planned
v0.4  skills                                  planned
v0.5  extensions/hooks                        planned
v0.6  MCP adapter                             planned
v0.7  session tree / branching                planned
v0.8  permission + sandbox policy             planned
v0.9  RPC / headless runtime                  planned
v1.0  stable runtime API                      planned
```

Read `Plan.md` for the canonical version sequence and acceptance criteria.

## 10. Development protocol

Before extending the runtime:

1. read `Agents.md`;
2. read `Plan.md`;
3. read `version.md`;
4. inspect the matching version note and tests;
5. keep one primary mental model per version.

`docs/ROADMAP.md` is intentionally only a compact summary so the repository has one canonical forward plan.

## 11. Design rule

Before adding something to core, ask:

> Is this required to run the feedback loop, or is it policy/workflow that can layer on top?

If it can layer on top, preserve the core loop and add a focused extension seam instead.
