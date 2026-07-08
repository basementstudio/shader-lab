import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { DEFAULT_BRIDGE_PORT, EditorBridge } from "./bridge"
import { getShaderApiReference } from "./shader-reference"
import { registerTools } from "./tools"

const INSTRUCTIONS = `Drives a running Shader Lab editor tab: create/remove/reorder/tweak layers and write custom TSL shaders with a compile feedback loop.

Setup requirement: the editor must be open in a WebGPU browser with the agent bridge enabled — run the dev server and open http://localhost:3000/tools/shader-lab?agent=1. Tools fail with a clear error until a tab connects.

Layer model: layers stack like Photoshop — index 0 is the top of the sidebar and is applied LAST; the highest index is the base/background (it renders first). Effects transform the composite of every layer below them in the sidebar (higher indices). New layers land at index 0 (top). Note: a source layer with compositeMode "filter" replaces what is below it.

Custom shaders (the main event): write_custom_shader compiles TSL source and returns the exact error message on failure — iterate until \`compiled: true\`, then call screenshot to see the pixels. Contract: export a named \`sketch\` (\`export const sketch = Fn(() => ...)\`) returning a TSL node; NO import statements (all of three/tsl plus house utils are injected globals, along with \`time\` and, in effect mode, \`inputTexture\`). Call get_shader_api_reference before writing your first shader.

All mutations go through the editor's normal undo history, so the user can Cmd+Z anything you do.`

function getPort(): number {
  const raw = process.env.SHADER_LAB_MCP_PORT

  if (!raw) {
    return DEFAULT_BRIDGE_PORT
  }

  const parsed = Number.parseInt(raw, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BRIDGE_PORT
}

async function main(): Promise<void> {
  const bridge = new EditorBridge()
  const port = getPort()
  const token = process.env.SHADER_LAB_AGENT_TOKEN ?? null

  bridge.start(port, token)
  console.error(
    `[shader-lab-mcp] bridge listening on ws://127.0.0.1:${port} — open the editor with ?agent=1${token ? `&agentToken=${token}` : ""}`
  )

  const server = new McpServer(
    { name: "shader-lab", version: "0.1.0" },
    { instructions: INSTRUCTIONS }
  )

  registerTools(server, bridge)

  server.registerResource(
    "shader-api-reference",
    "shader-lab://shader-api",
    {
      description:
        "Custom shader contract and the full list of globals available to TSL sketches",
      mimeType: "text/markdown",
      title: "Shader Lab custom shader API",
    },
    async (uri) => ({
      contents: [
        {
          mimeType: "text/markdown",
          text: await getShaderApiReference(),
          uri: uri.href,
        },
      ],
    })
  )

  const transport = new StdioServerTransport()

  await server.connect(transport)
  console.error("[shader-lab-mcp] MCP server ready on stdio")
}

main().catch((error) => {
  console.error("[shader-lab-mcp] fatal:", error)
  process.exit(1)
})
