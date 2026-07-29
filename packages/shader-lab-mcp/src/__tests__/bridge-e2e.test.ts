import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  executeAgentCommand,
  AgentCommandError,
} from "@/lib/agent-bridge/commands"
import { emitCustomShaderCompileResult } from "@/lib/agent-bridge/compile-events"
import {
  buildErrorResponse,
  buildSuccessResponse,
  parseAgentBridgeRequest,
  serializeAgentBridgeResponse,
} from "@/lib/agent-bridge/protocol"
import { useLayerStore } from "@/store/layer-store"

const PORT = 17423
const PACKAGE_ROOT = new URL("../..", import.meta.url).pathname

let client: Client
let fakeTab: WebSocket | null = null

function getText(result: unknown): string {
  const content = (result as { content: { text?: string; type: string }[] })
    .content
  const textPart = content.find((part) => part.type === "text")

  return textPart?.text ?? ""
}

function getJson<T>(result: unknown): T {
  return JSON.parse(getText(result)) as T
}

function connectFakeEditorTab(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/`)

    socket.addEventListener("open", () => {
      resolve(socket)
    })
    socket.addEventListener("error", () => {
      reject(new Error("Fake editor tab could not connect to the bridge."))
    })
    socket.addEventListener("message", (event) => {
      void (async () => {
        const request = parseAgentBridgeRequest(event.data)

        if (!request) {
          return
        }

        try {
          const result = await executeAgentCommand(
            request.command,
            request.payload
          )

          socket.send(
            serializeAgentBridgeResponse(
              buildSuccessResponse(request.id, result ?? null)
            )
          )
        } catch (error) {
          socket.send(
            serializeAgentBridgeResponse(
              buildErrorResponse(
                request.id,
                error instanceof AgentCommandError
                  ? error.message
                  : `Unexpected error: ${String(error)}`
              )
            )
          )
        }
      })()
    })
  })
}

beforeAll(async () => {
  useLayerStore.getState().replaceState([], null, null, [])

  const build = Bun.spawnSync(["bunx", "xmcp", "build"], {
    cwd: PACKAGE_ROOT,
    stderr: "pipe",
    stdout: "pipe",
  })

  if (build.exitCode !== 0) {
    throw new Error(`xmcp build failed: ${build.stderr.toString()}`)
  }

  client = new Client({ name: "e2e-test", version: "0.0.0" })

  const transport = new StdioClientTransport({
    args: ["dist/stdio.js"],
    command: "node",
    cwd: PACKAGE_ROOT,
    env: { ...process.env, SHADER_LAB_MCP_PORT: String(PORT) },
    stderr: "ignore",
  })

  await client.connect(transport)
}, 120_000)

afterAll(async () => {
  fakeTab?.close()
  await client.close()
})

describe("shader-lab MCP end to end", () => {
  test("lists the full tool surface", async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort()

    expect(names).toEqual([
      "add_layer",
      "add_media_layer",
      "describe_layer_type",
      "duplicate_layer",
      "get_custom_shader",
      "get_layer",
      "get_project_state",
      "get_shader_api_reference",
      "list_layer_types",
      "remove_layers",
      "rename_layer",
      "reorder_layer",
      "reset_layer_params",
      "screenshot",
      "select_layer",
      "set_layer_visibility",
      "update_layer",
      "update_layer_params",
      "write_custom_shader",
    ])
  })

  test("answers the shader API reference without an editor tab", async () => {
    const result = await client.callTool({
      arguments: { section: "examples" },
      name: "get_shader_api_reference",
    })

    expect(getText(result)).toContain("export const sketch = Fn")
  })

  test("reports a clear error when no editor tab is connected", async () => {
    const result = await client.callTool({
      arguments: {},
      name: "get_project_state",
    })

    expect(result.isError).toBe(true)
    expect(getText(result)).toContain("?agent=1")
  })

  test("proxies commands to a connected editor tab", async () => {
    fakeTab = await connectFakeEditorTab()

    const added = await client.callTool({
      arguments: { name: "Base Gradient", type: "gradient" },
      name: "add_layer",
    })
    const layer = getJson<{ id: string; name: string; type: string }>(added)

    expect(layer.type).toBe("gradient")
    expect(layer.name).toBe("Base Gradient")

    const state = await client.callTool({
      arguments: {},
      name: "get_project_state",
    })
    const project = getJson<{ layers: { id: string }[] }>(state)

    expect(project.layers.some((entry) => entry.id === layer.id)).toBe(true)
  })

  test("validates and clamps params through the full chain", async () => {
    const added = await client.callTool({
      arguments: { type: "halftone" },
      name: "add_layer",
    })
    const layer = getJson<{ id: string }>(added)

    const description = await client.callTool({
      arguments: { type: "halftone" },
      name: "describe_layer_type",
    })
    const schema = getJson<{
      params: { key: string; max?: number; type: string }[]
    }>(description)
    const numberParam = schema.params.find(
      (param) => param.type === "number" && param.max !== undefined
    )

    expect(numberParam).toBeDefined()

    const updated = await client.callTool({
      arguments: {
        id: layer.id,
        params: {
          [numberParam?.key ?? ""]: (numberParam?.max ?? 0) + 999,
          notAKey: true,
        },
      },
      name: "update_layer_params",
    })
    const report = getJson<{
      applied: string[]
      clamped: { key: string }[]
      rejected: { key: string }[]
    }>(updated)

    expect(report.applied).toContain(numberParam?.key)
    expect(report.clamped[0]?.key).toBe(numberParam?.key)
    expect(report.rejected[0]?.key).toBe("notAKey")
  })

  test("write_custom_shader round-trips the compile ack", async () => {
    const pending = client.callTool({
      arguments: {
        sourceCode: "export const sketch = Fn(() => vec3(1, 0, 0))",
      },
      name: "write_custom_shader",
    })

    const ackCompile = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const shaderLayer = useLayerStore
          .getState()
          .layers.find(
            (entry) =>
              entry.type === "custom-shader" &&
              entry.params.sourceCode ===
                "export const sketch = Fn(() => vec3(1, 0, 0))"
          )

        if (shaderLayer) {
          emitCustomShaderCompileResult({
            error: null,
            layerId: shaderLayer.id,
            revision: shaderLayer.params.sourceRevision as number,
          })
          return
        }

        await Bun.sleep(20)
      }
    }

    const [result] = await Promise.all([pending, ackCompile()])
    const outcome = getJson<{
      compiled: boolean
      error: string | null
      layerId: string
    }>(result)

    expect(outcome.compiled).toBe(true)
    expect(outcome.error).toBeNull()

    const shader = await client.callTool({
      arguments: { layerId: outcome.layerId },
      name: "get_custom_shader",
    })

    expect(getJson<{ sourceCode: string }>(shader).sourceCode).toBe(
      "export const sketch = Fn(() => vec3(1, 0, 0))"
    )
  })
})
