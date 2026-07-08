# @basementstudio/shader-lab-mcp

MCP server that lets an AI agent drive a running Shader Lab editor tab: create,
remove, reorder, and tweak layers — and write custom TSL shaders with a real
feedback loop (compile errors and canvas screenshots go straight back to the
agent). Built with [xmcp](https://xmcp.dev): tools live as files in
`src/tools/`, the server config (transport, instructions) lives in
`xmcp.config.ts`, and `xmcp build` bundles everything into `dist/stdio.js`.

## How it works

```
MCP client (Claude Code) ⇄ stdio ⇄ shader-lab-mcp (Bun process)
                                        ⇅ WebSocket (127.0.0.1:7420)
                                  editor tab (?agent=1)
```

The server speaks MCP over stdio and hosts a localhost-only WebSocket bridge.
The editor connects to the bridge when opened with `?agent=1`; every tool call
is relayed to the tab and executed through the editor's normal zustand store
actions, so **everything the agent does lands in the undo history** (Cmd+Z
works).

## Setup

1. Start the dev server: `bun dev`
2. Open the editor with the bridge enabled, in a WebGPU browser:
   `http://localhost:3000/tools/shader-lab?agent=1`
3. The MCP server is registered in the repo's `.mcp.json` — Claude Code picks
   it up automatically. To run it manually: `bun run mcp` (from the repo root).

Environment variables:

- `SHADER_LAB_MCP_PORT` — bridge port (default `7420`; pass `?agentPort=` to
  the editor if you change it)
- `SHADER_LAB_AGENT_TOKEN` — optional shared secret; when set, the tab must be
  opened with `?agent=1&agentToken=<token>`
- `SHADER_LAB_ALLOWED_ORIGINS` — extra origins allowed to connect (comma
  separated, `https://*.vercel.app` wildcards supported). Localhost origins
  and the production deployment (`https://eng.basement.studio`) are always
  allowed. Use this to drive any other deployed tab (e.g. a Vercel preview):
  the server still runs on your machine; the tab connects to your loopback.

Only connections from `localhost` origins (plus any explicitly allowed extra
origins) are accepted, and the bridge binds to `127.0.0.1`.

## Tools

- **Read** — `get_project_state`, `get_layer`, `list_layer_types`,
  `describe_layer_type` (full param schema with ranges/options/defaults),
  `screenshot` (renders through the export pipeline, returns a PNG)
- **Mutate** — `add_layer`, `remove_layers`, `duplicate_layer`,
  `reorder_layer`, `rename_layer`, `set_layer_visibility`, `select_layer`,
  `update_layer` (opacity/hue/saturation/blend/composite/mask),
  `update_layer_params` (validated against the layer schema — out-of-range
  numbers are clamped and reported, bad keys/types rejected with reasons),
  `reset_layer_params`
- **Custom shaders** — `write_custom_shader` (writes TSL source and waits for
  the compile result; returns the exact compiler/runtime error on failure),
  `get_custom_shader`, `get_shader_api_reference` (the shader contract plus
  every global available to sketches — house util sources are read from disk
  and `three/tsl` exports are enumerated at runtime, so the reference can
  never drift from what actually executes)

## The shader loop

```
get_shader_api_reference → write_custom_shader → (error? fix → write again)
    → screenshot → tweak params → screenshot
```

`write_custom_shader` resolves when the editor finishes compiling that exact
source revision, so the agent sees `{ compiled: false, error: "..." }` with
the real sanitizer/transpile/eval message and can iterate immediately.

## Development

- `bun run --cwd packages/shader-lab-mcp dev` — xmcp dev server with hot reload
- `bun run --cwd packages/shader-lab-mcp build` — bundle to `dist/stdio.js`
- `bun run --cwd packages/shader-lab-mcp typecheck` — xmcp's own build-time
  checker is disabled (it OOMs on the zod/tsl type surface); this is the type
  gate instead
- `bun test packages/shader-lab-mcp` — end-to-end test that builds the bundle,
  spawns the real `dist/stdio.js`, connects an MCP client over stdio, and fakes
  an editor tab over the real WebSocket bridge (headless stores, no GPU needed)

Layout: one file per tool in `src/tools/` (xmcp file-system routing), the
`shader-lab://shader-api` resource in `src/resources/(shader-lab)/`, and the
shared WebSocket bridge + shader reference in `src/lib/`.
