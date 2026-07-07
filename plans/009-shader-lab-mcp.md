# Plan 009 — Shader Lab MCP server (layer control + custom shader authoring)

## Goal

Let an AI agent (Claude Code or any MCP client) drive a running Shader Lab editor tab:
create, delete, reorder, and tweak layers — and, most importantly, **write custom
shaders** with a tight feedback loop (compile/runtime errors + canvas screenshots
returned straight to the agent).

The custom-shader loop is the headline feature. Everything about the architecture is
chosen to make "agent writes TSL → sees the error or the pixels → iterates" fast and
reliable.

## Why this is feasible today

- All editor mutations already flow through `useLayerStore` actions
  (`src/store/layer-store.ts`): `addLayer`, `removeLayers`, `duplicateLayer`,
  `reorderLayers`, `renameLayer`, `updateLayerParam`, `setLayerOpacity`,
  `setLayerBlendMode`, `setLayerMaskConfig`, `resetLayerParams`, etc. The MCP just
  needs a wire into the tab that calls these.
- Custom shaders are plain data: the `custom-shader` / `custom-effect` layer keeps TSL
  source in `params.sourceCode`. `compileCustomShaderModule`
  (`src/renderer/custom-shader-runtime.ts`) sanitizes (strips imports/JSX, forbids
  explicit `import`), transpiles with the TypeScript compiler, evaluates against a
  prelude (`three/tsl` + `@/renderer/shaders/tsl/utils`), and demands a named
  `sketch` export returning a TSL node. **Every failure becomes a thrown Error whose
  message lands in `layer.runtimeError` via `setLayerRuntimeError`** — a ready-made
  error channel to relay back to the agent.
- The parameter registry (`src/lib/editor/config/layer-registry.ts`) is data:
  types, ranges, step, options, defaults, visibility conditions per layer type. It can
  be serialized into a `describe_layer_type` tool so the agent knows exactly what is
  tweakable and within what bounds — no guessing.
- History is centralized (`src/store/history-store.ts` — `pushSnapshot`). Agent
  mutations can push labeled snapshots so the user can Cmd+Z anything the agent did.

## Architecture

**Standalone Bun MCP server (stdio) + WebSocket bridge into the editor tab.**

```
Claude Code ⇄ stdio (MCP) ⇄ shader-lab-mcp (Bun process)
                                  ⇅ WebSocket (localhost:7420)
                            editor tab (agent-bridge client)
                                  ⇅ zustand stores / renderer
```

- `packages/shader-lab-mcp/` — private workspace package (`"private": true`, ignored
  by changesets). Uses `@modelcontextprotocol/sdk` (`McpServer` +
  `StdioServerTransport`) and `Bun.serve({ websocket })` for the bridge. Run via
  `bun run mcp` root script; registered in the repo's `.mcp.json` so Claude Code picks
  it up automatically.
- Editor side: `src/lib/agent-bridge/` — a small client that connects to
  `ws://localhost:7420` **only when enabled** (dev-only, gated behind
  `NEXT_PUBLIC_AGENT_BRIDGE=1` or `?agent=1` query param). It executes named commands
  against the stores and replies. Zero cost when disabled; excluded from any prod
  bundle path via the flag check.
- Protocol: JSON request/response envelope `{ id, command, payload }` →
  `{ id, ok, result | error }`. Server-side per-request timeout (default 5s,
  30s for shader compile + screenshot). If no tab is connected, every tool returns a
  clear "editor not connected — open the editor with ?agent=1" error instead of
  hanging. If several tabs connect, the most recent connection wins (older one gets a
  "replaced" close frame).

Why not a Next.js route handler (streamable HTTP MCP): route handlers don't hold a
persistent socket to the tab cleanly, and coupling the MCP lifecycle to `next dev`
makes restarts flaky. A standalone Bun process is ~200 lines, owns both transports,
and works regardless of how the editor is served.

Security: bridge binds to `127.0.0.1` only. A random session token is printed by the
server and passed by the tab (query param) — enough to keep other local processes /
random web pages (WebSocket connections are not blocked by CORS) from driving the
editor.

## Tool surface

### Read tools

| Tool | Backing | Returns |
|---|---|---|
| `get_project_state` | store snapshots | composition size, layer list (id, type, name, visible, locked, opacity, blendMode, compositeMode, runtimeError), selected layer id |
| `get_layer` | `getLayerById` | full layer including `params` |
| `describe_layer_type` | layer registry | serialized param schema for a type: key, label, type, min/max/step, options, default |
| `list_layer_types` | `LAYER_TYPES` + registry | available types with one-line descriptions (source vs effect) |
| `screenshot` | renderer readback | current canvas as PNG, returned as MCP **image content** |

### Mutation tools (each pushes a labeled history snapshot: `"Agent: <action>"`)

| Tool | Backing store action |
|---|---|
| `add_layer(type, insertIndex?, name?)` | `addLayer` (+ optional `renameLayer`) — returns new layer id |
| `remove_layers(ids)` | `removeLayers` |
| `duplicate_layer(id)` | `duplicateLayer` |
| `reorder_layer(id, toIndex)` | index lookup + `reorderLayers` |
| `rename_layer(id, name)` | `renameLayer` |
| `set_layer_visibility(id, visible)` | `setLayerVisibility` |
| `update_layer(id, patch)` | opacity/hue/saturation/blendMode/compositeMode/maskConfig setters, batched |
| `update_layer_params(id, params)` | `updateLayerParam` per key — validated against the registry first; response lists applied keys and rejected keys with reasons (unknown key, out of range, wrong type) |
| `reset_layer_params(id)` | `resetLayerParams` |
| `select_layer(id)` | `selectLayer` (so the user sees what the agent is touching) |

`update_layer_params` clamps numbers to `[min, max]` from the registry rather than
rejecting, and reports the clamp — agents overshoot ranges constantly and a clamp +
note converges faster than an error.

### Custom shader tools (the star)

| Tool | Behavior |
|---|---|
| `write_custom_shader(layerId?, sourceCode)` | If `layerId` omitted, adds a `custom-shader` layer first (`custom-effect` if `mode: "effect"` is passed). Sets `params.sourceCode`, then **waits for the compile round-trip**: the bridge subscribes to that layer's `runtimeError` and to a "pass rebuilt successfully" signal, and resolves with `{ ok: true }` or `{ ok: false, error }` — the exact sanitizer/transpile/eval message the editor shows. Timeout 10s. |
| `get_custom_shader(layerId)` | current `sourceCode` (+ `entryExport`, mode) |
| `get_shader_api_reference` | static doc (also exposed as an MCP **resource**): the whole prelude surface — `three/tsl` exports plus everything under `src/renderer/shaders/tsl/` (`utils`, `color`, `noise`, `patterns`, `cosine-palette`) — with signatures, the sanitizer contract (no `import` statements, named export `sketch`, must return a TSL node, `inputTexture` available in effect mode), and both starters from `src/lib/editor/custom-shader/shared.ts` as worked examples |

The intended agent loop:

```
describe → write_custom_shader → (error? fix → write again) → screenshot → tweak → screenshot
```

**Compile-completion signal.** `runtimeError` alone can't distinguish "compiled
clean" from "still compiling" (it's nulled on write). S3 adds a monotonic
`sourceRevision`-keyed ack: the custom-shader pass already tracks
`sourceRevision` in params; when a rebuild for revision N finishes (success or
error), the pass reports it (tiny callback on the pass, wired through the existing
runtime-error plumbing in `shader-lab-composition.tsx`). The bridge resolves the tool
call when the ack for its revision arrives.

**Screenshot.** Reuse the export path's readback rather than `canvas.toBlob` (WebGPU
canvas buffers are cleared after present): render one frame to an RT and
`readRenderTargetPixelsAsync` → PNG-encode in the tab (OffscreenCanvas) → base64 over
the bridge. Cap at composition size, downscale to ≤1024px wide by default
(`full: true` opt-out) to keep MCP payloads small.

## Stages

### S1 — Bridge + server skeleton, structural tools
- `packages/shader-lab-mcp/`: MCP stdio server, WS bridge, request/response envelope,
  timeout + not-connected + replaced-tab handling, session token.
- `src/lib/agent-bridge/`: client (flag-gated), command registry, handlers for
  `get_project_state`, `get_layer`, `list_layer_types`, `add_layer`, `remove_layers`,
  `duplicate_layer`, `reorder_layer`, `rename_layer`, `set_layer_visibility`,
  `select_layer`.
- Root script `mcp`, `.mcp.json` entry, README section.
- **Gate:** unit tests for the envelope + command validation (pure TS, `bun test`);
  typecheck + lint green.

### S2 — Parameter tooling
- Registry serializer → `describe_layer_type`; `update_layer_params` with
  clamp-and-report validation; `update_layer` batch setter; `reset_layer_params`.
- History integration: every mutation pushes `"Agent: …"` snapshots (same
  snapshot shape the keyboard undo uses).
- **Gate:** unit tests for registry serialization and param validation/clamping
  against real layer definitions (these run headless — the registry is pure data).

### S3 — Custom shader loop
- `write_custom_shader` / `get_custom_shader` with the revision-ack compile signal.
- `get_shader_api_reference` doc + MCP resource. Generate the prelude listing from
  the actual module exports at build time (a small script), not hand-maintained.
- **Gate:** unit tests for the ack state machine (pure); compile round-trip verified
  manually in-browser (GPU-dependent — deferred to user per repo constraint).

### S4 — Screenshot + polish
- `screenshot` tool via RT readback; downscale; MCP image content.
- Multi-tab arbitration polish, docs (`plans/009-artifacts/usage.md` with an example
  agent session), demo prompt.
- **Gate:** full `bun run check`; end-to-end session tested by user in a WebGPU
  browser.

## Risks / open questions

- **MCP SDK zod version:** repo is on zod v4; `@modelcontextprotocol/sdk` pins zod
  v3 for tool schemas. Keep the server package's zod dependency independent
  (workspace package.json) so the app's v4 usage is untouched.
- **Compile ack plumbing** touches `custom-shader-pass` and the composition's
  runtime-error wiring — keep it additive (optional callback) so the package mirror
  and non-bridge sessions are unaffected.
- **Screenshot color space:** readback is linear; convert to sRGB before PNG encode
  (same conversion the export path already does).
- **`params.sourceCode` size:** shaders can be multi-KB; fine for WS and MCP, but
  `get_project_state` must omit `sourceCode` from layer summaries (fetch via
  `get_layer`/`get_custom_shader` only) to keep listings cheap.
- **Timeline/keyframes** are out of scope for v1 (timeline-store is a second, larger
  surface). Structural + param + shader control first; a `009b` follow-up can add
  keyframe tools if the loop proves out.
