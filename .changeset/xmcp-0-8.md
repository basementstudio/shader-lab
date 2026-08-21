---
"@basementstudio/shader-lab-mcp": patch
---

Move the MCP server to xmcp 0.8.0. The framework split its build compiler into
`@xmcp-dev/compiler`, which is a dev-only dependency, and dropped its own runtime
dependencies — a production install of the published server goes from ~101 MB to
~10 MB. `@modelcontextprotocol/sdk` moves to `^1.26.0` to satisfy the peer range
0.8.0 declares; the previous pin at `1.17.5` would otherwise have been the copy
bundled into `dist/`.
