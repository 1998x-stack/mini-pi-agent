import { Agent, OpenAICompatibleLLM, createSafeFileTools, createShellTool } from "../src/index.js";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!apiKey || !model) throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL");

const cwd = process.cwd();
const providerOptions: ConstructorParameters<typeof OpenAICompatibleLLM>[0] = { apiKey, model };
if (process.env.OPENAI_BASE_URL) providerOptions.baseUrl = process.env.OPENAI_BASE_URL;

const agent = await Agent.create({
  provider: new OpenAICompatibleLLM(providerOptions),
  systemPrompt: "You are a coding agent. Inspect before editing and verify after editing.",
  tools: [
    ...createSafeFileTools(cwd),
    // Shell is deliberately opt-in because it is a much stronger capability.
    createShellTool({ cwd })
  ],
  cwd
});

const result = await agent.prompt("Inspect package.json and summarize this project.");
console.log(result.finalMessage.content);
