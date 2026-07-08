import type { XmcpConfig } from "xmcp"

const config: XmcpConfig = {
  paths: {
    prompts: false,
    resources: "src/resources",
    tools: "src/tools",
  },
  stdio: {
    silent: true,
  },
  typescript: {
    // xmcp's parallel checker OOMs on the zod/tsl type surface; the package's
    // own `tsc --noEmit` (bun run typecheck) covers type safety instead.
    skipTypeCheck: true,
  },
  template: {
    description:
      "Drives a running Shader Lab editor tab: layer control and custom shader authoring",
    instructions: `Drives a running Shader Lab editor tab: create/remove/reorder/tweak layers and write custom TSL shaders with a compile feedback loop.

Setup requirement: the editor must be open in a WebGPU browser with the agent bridge enabled — run the dev server and open http://localhost:3000/tools/shader-lab?agent=1. Tools fail with a clear error until a tab connects.

Layer model: layers stack like Photoshop — index 0 is the top of the sidebar and is applied LAST; the highest index is the base/background (it renders first). Effects transform the composite of every layer below them in the sidebar (higher indices). New layers land at index 0 (top). Note: a source layer with compositeMode "filter" replaces what is below it.

Custom shaders (the main event): write_custom_shader compiles TSL source and returns the exact error message on failure — iterate until \`compiled: true\`, then call screenshot to see the pixels. Contract: export a named \`sketch\` (\`export const sketch = Fn(() => ...)\`) returning a TSL node; NO import statements (all of three/tsl plus house utils are injected globals, along with \`time\` and, in effect mode, \`inputTexture\`). Call get_shader_api_reference before writing your first shader.

All mutations go through the editor's normal undo history, so the user can Cmd+Z anything you do.`,
    name: "Shader Lab",
  },
}

export default config
