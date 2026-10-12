import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PathOutsideRootError, createEditTool, createReadTool, createWriteTool } from "../src/index.js";

const signal = new AbortController().signal;

describe("file tools", () => {
  it("writes, reads and edits inside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mini-pi-"));
    const write = createWriteTool(root);
    const read = createReadTool(root);
    const edit = createEditTool(root);

    await write.execute({ path: "a.txt", content: "hello" }, { cwd: root, signal });
    expect((await read.execute({ path: "a.txt" }, { cwd: root, signal })).content).toBe("hello");
    await edit.execute({ path: "a.txt", oldText: "hello", newText: "world" }, { cwd: root, signal });
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("world");
  });

  it("blocks path traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "mini-pi-"));
    const read = createReadTool(root);
    await expect(read.execute({ path: "../secret.txt" }, { cwd: root, signal })).rejects.toBeInstanceOf(PathOutsideRootError);
  });
});
