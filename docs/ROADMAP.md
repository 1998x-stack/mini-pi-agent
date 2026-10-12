# Roadmap

> This file is a compact navigation summary. The canonical development sequence, architecture rationale, invariants, and Definition of Done live in [`../Plan.md`](../Plan.md).

`mini-pi-agent` evolves one runtime mental model at a time:

```text
v0.1  Core feedback loop                       implemented
v0.2  Streaming protocol + ToolScheduler       next
v0.3  Context budget + compaction              planned
v0.4  Skills                                   planned
v0.5  Extensions / lifecycle hooks             planned
v0.6  MCP adapter                              planned
v0.7  Session tree / branching / checkpoints   planned
v0.8  Permission + sandbox policy              planned
v0.9  RPC / headless runtime                   planned
v1.0  Stable runtime API                       planned
```

## Reading rule

For future work:

1. read root `Agents.md`;
2. read root `Plan.md`;
3. read root `version.md`;
4. read the matching `docs/versions/vX.Y.md`;
5. then inspect implementation/tests.

Do not use this summary as a substitute for `Plan.md` when deciding scope.
