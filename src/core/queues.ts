import type { UserMessage } from "./types.js";

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: Date.now() };
}

export class MessageQueue {
  private readonly items: UserMessage[] = [];

  push(content: string): void {
    this.items.push(userMessage(content));
  }

  drain(): UserMessage[] {
    return this.items.splice(0, this.items.length);
  }

  get size(): number {
    return this.items.length;
  }
}
