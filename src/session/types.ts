import type { AgentMessage } from "../core/types.js";

export interface SessionStore {
  load(): Promise<AgentMessage[]>;
  append(message: AgentMessage): Promise<void>;
  clear(): Promise<void>;
}
