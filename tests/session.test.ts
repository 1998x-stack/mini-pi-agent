import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlSessionStore } from "../src/index.js";

describe("JsonlSessionStore", () => {
  it("persists append-only messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "mini-pi-session-"));
    const store = new JsonlSessionStore(join(root, "session.jsonl"));
    await store.append({ role: "user", content: "hello", timestamp: 1 });
    await store.append({ role: "assistant", content: "hi", toolCalls: [], timestamp: 2 });
    const messages = await store.load();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
  });
});
