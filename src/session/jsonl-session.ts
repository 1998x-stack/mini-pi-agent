import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentMessage } from "../core/types.js";
import type { SessionStore } from "./types.js";

export class JsonlSessionStore implements SessionStore {
  constructor(readonly path: string) {}

  async load(): Promise<AgentMessage[]> {
    try {
      const text = await readFile(this.path, "utf8");
      if (!text.trim()) return [];
      return text
        .split("\n")
        .filter(Boolean)
        .map((line: string, index: number) => {
          try {
            return JSON.parse(line) as AgentMessage;
          } catch (error) {
            throw new Error(`Invalid JSONL at line ${index + 1}`, { cause: error });
          }
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async append(message: AgentMessage): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(message)}\n`, "utf8");
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
