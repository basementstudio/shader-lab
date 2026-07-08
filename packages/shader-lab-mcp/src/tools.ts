import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { EditorBridge } from "./bridge"
import {
  SHADER_REFERENCE_SECTIONS,
  getShaderApiReference,
} from "./shader-reference"

const WRITE_SHADER_TIMEOUT_MS = 15_000
const SCREENSHOT_TIMEOUT_MS = 30_000

interface TextContent {
  text: string
  type: "text"
  [key: string]: unknown
}

interface ImageContent {
  data: string
  mimeType: string
  type: "image"
  [key: string]: unknown
}

interface ToolResult {
  content: (ImageContent | TextContent)[]
  isError?: boolean
  [key: string]: unknown
}

function textResult(value: unknown): ToolResult {
  return {
    content: [
      {
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
        type: "text",
      },
    ],
  }
}

function errorResult(error: unknown): ToolResult {
  return {
    content: [
      {
        text: error instanceof Error ? error.message : String(error),
        type: "text",
      },
    ],
    isError: true,
  }
}

async function proxy(
  bridge: EditorBridge,
  command: string,
  payload: Record<string, unknown>,
  timeoutMs?: number
): Promise<ToolResult> {
  try {
    const result = await bridge.request(command, payload, timeoutMs)

    return textResult(result)
  } catch (error) {
    return errorResult(error)
  }
}

export function registerTools(server: McpServer, bridge: EditorBridge): void {
  server.registerTool(
    "get_project_state",
    {
      description:
        "Get the current editor state: composition size, the layer stack, and the selected layer. Layers stack like Photoshop: index 0 is the top of the sidebar (applied last), the highest index is the base/background. Layer params are omitted here; use get_layer for full params.",
      inputSchema: {},
    },
    () => proxy(bridge, "get_project_state", {})
  )

  server.registerTool(
    "get_layer",
    {
      description:
        "Get one layer with its full parameter values (including custom shader source).",
      inputSchema: { id: z.string().describe("Layer id") },
    },
    (args) => proxy(bridge, "get_layer", args)
  )

  server.registerTool(
    "list_layer_types",
    {
      description:
        "List every layer type that can be added (sources generate imagery, effects transform the layers before them, model renders 3D). Use describe_layer_type for a type's parameters.",
      inputSchema: {},
    },
    () => proxy(bridge, "list_layer_types", {})
  )

  server.registerTool(
    "describe_layer_type",
    {
      description:
        "Get the full parameter schema for a layer type: keys, value types, ranges, step, select options, and defaults. Call this before update_layer_params so values land in range.",
      inputSchema: {
        type: z.string().describe("Layer type, e.g. `halftone` or `gradient`"),
      },
    },
    (args) => proxy(bridge, "describe_layer_type", args)
  )

  server.registerTool(
    "add_layer",
    {
      description:
        "Add a new layer. Without insertIndex it goes to index 0 (top of the stack — applied last, so an effect added there transforms everything below it). The new layer is returned with its default params and becomes selected.",
      inputSchema: {
        insertIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Position in the stack; omit for index 0"),
        name: z.string().optional().describe("Optional custom layer name"),
        type: z.string().describe("Layer type from list_layer_types"),
      },
    },
    (args) => proxy(bridge, "add_layer", args)
  )

  server.registerTool(
    "remove_layers",
    {
      description: "Remove one or more layers by id.",
      inputSchema: {
        ids: z.array(z.string()).min(1).describe("Layer ids to remove"),
      },
    },
    (args) => proxy(bridge, "remove_layers", args)
  )

  server.registerTool(
    "duplicate_layer",
    {
      description:
        "Duplicate a layer (copy is inserted right after the source layer).",
      inputSchema: { id: z.string().describe("Layer id to duplicate") },
    },
    (args) => proxy(bridge, "duplicate_layer", args)
  )

  server.registerTool(
    "reorder_layer",
    {
      description:
        "Move a layer to a new index in the stack. Remember: index 0 is the top (applied last), the highest index is the base — effects only affect layers below them (higher indices).",
      inputSchema: {
        id: z.string().describe("Layer id to move"),
        toIndex: z.number().int().min(0).describe("Target index"),
      },
    },
    (args) => proxy(bridge, "reorder_layer", args)
  )

  server.registerTool(
    "rename_layer",
    {
      description: "Rename a layer.",
      inputSchema: {
        id: z.string().describe("Layer id"),
        name: z.string().min(1).describe("New name"),
      },
    },
    (args) => proxy(bridge, "rename_layer", args)
  )

  server.registerTool(
    "set_layer_visibility",
    {
      description: "Show or hide a layer.",
      inputSchema: {
        id: z.string().describe("Layer id"),
        visible: z.boolean(),
      },
    },
    (args) => proxy(bridge, "set_layer_visibility", args)
  )

  server.registerTool(
    "select_layer",
    {
      description:
        "Select a layer in the editor UI (or pass no id to clear the selection). Useful to show the user what you are working on.",
      inputSchema: {
        id: z.string().optional().describe("Layer id; omit to deselect"),
      },
    },
    (args) => proxy(bridge, "select_layer", args)
  )

  server.registerTool(
    "update_layer",
    {
      description:
        "Update layer-level properties: opacity (0-1), hue (-180 to 180), saturation (0-2), blendMode, compositeMode, and maskConfig. For effect-specific parameters use update_layer_params.",
      inputSchema: {
        blendMode: z.string().optional(),
        compositeMode: z.string().optional(),
        hue: z.number().optional(),
        id: z.string().describe("Layer id"),
        maskConfig: z
          .object({
            invert: z.boolean().optional(),
            mode: z.string().optional(),
            source: z.string().optional(),
          })
          .optional(),
        opacity: z.number().optional(),
        saturation: z.number().optional(),
      },
    },
    (args) => proxy(bridge, "update_layer", args)
  )

  server.registerTool(
    "update_layer_params",
    {
      description:
        "Update effect parameters on a layer. Values are validated against the layer's schema: out-of-range numbers are clamped (and reported), unknown keys and wrong types are rejected with reasons. The response lists applied/clamped/rejected keys plus the resulting layer.",
      inputSchema: {
        id: z.string().describe("Layer id"),
        params: z
          .record(z.string(), z.unknown())
          .describe("Key/value pairs from describe_layer_type"),
      },
    },
    (args) => proxy(bridge, "update_layer_params", args)
  )

  server.registerTool(
    "reset_layer_params",
    {
      description: "Reset all of a layer's parameters to their defaults.",
      inputSchema: { id: z.string().describe("Layer id") },
    },
    (args) => proxy(bridge, "reset_layer_params", args)
  )

  server.registerTool(
    "write_custom_shader",
    {
      description:
        "Write TSL source code into a custom shader layer and wait for the compile result. Omit layerId to create a new custom shader layer. Returns { compiled, error } — on failure, `error` is the exact compiler/runtime message, so fix and retry. Read get_shader_api_reference before writing your first shader: no imports allowed, export a named `sketch` via `export const sketch = Fn(() => ...)` returning a TSL node. Set effectMode true to transform the layers below (sample with `inputTexture.sample(...)`), false/omit to generate imagery from scratch.",
      inputSchema: {
        effectMode: z
          .boolean()
          .optional()
          .describe(
            "true: transform the layer stack below via inputTexture; false: generate from scratch"
          ),
        layerId: z
          .string()
          .optional()
          .describe("Existing custom shader layer id; omit to create one"),
        sourceCode: z.string().describe("TSL sketch source code"),
      },
    },
    (args) => proxy(bridge, "write_custom_shader", args, WRITE_SHADER_TIMEOUT_MS)
  )

  server.registerTool(
    "get_custom_shader",
    {
      description:
        "Get the current source code, mode, and runtime error state of a custom shader layer.",
      inputSchema: { layerId: z.string().describe("Custom shader layer id") },
    },
    (args) => proxy(bridge, "get_custom_shader", args)
  )

  server.registerTool(
    "get_shader_api_reference",
    {
      description:
        "The custom shader API reference. Without a section: the shader contract plus a grouped index of every global (house utils + three/tsl). With a section (noise, color, patterns, sdf, complex, math, tsl-core, examples): full util sources or the complete TSL export list.",
      inputSchema: {
        section: z
          .enum(SHADER_REFERENCE_SECTIONS)
          .optional()
          .describe("Section to expand; omit for the overview"),
      },
    },
    async (args) => {
      try {
        return textResult(await getShaderApiReference(args.section))
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  server.registerTool(
    "screenshot",
    {
      description:
        "Render the current composition to a PNG and return it as an image. Use this to see the result of your changes. Renders through the export pipeline (deterministic, full quality) at the current timeline time unless `time` is given.",
      inputSchema: {
        maxWidth: z
          .number()
          .int()
          .min(64)
          .max(4096)
          .optional()
          .describe("Max output width in px (default 960)"),
        time: z
          .number()
          .min(0)
          .optional()
          .describe("Timeline time in seconds (default: current time)"),
      },
    },
    async (args) => {
      try {
        const result = (await bridge.request(
          "screenshot",
          args,
          SCREENSHOT_TIMEOUT_MS
        )) as {
          base64: string
          height: number
          mimeType: string
          time: number
          width: number
        }

        return {
          content: [
            {
              data: result.base64,
              mimeType: result.mimeType,
              type: "image" as const,
            },
            {
              text: `Rendered ${result.width}x${result.height} at t=${result.time.toFixed(2)}s`,
              type: "text" as const,
            },
          ],
        }
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
