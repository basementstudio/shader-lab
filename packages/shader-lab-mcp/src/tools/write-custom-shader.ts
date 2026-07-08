import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy, WRITE_SHADER_TIMEOUT_MS } from "../lib/proxy"

export const schema = {
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
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Write custom shader",
  },
  description:
    "Write TSL source code into a custom shader layer and wait for the compile result. Omit layerId to create a new custom shader layer. Returns { compiled, error } — on failure, `error` is the exact compiler/runtime message, so fix and retry. Read get_shader_api_reference before writing your first shader: no imports allowed, export a named `sketch` via `export const sketch = Fn(() => ...)` returning a TSL node. Set effectMode true to transform the layers below (sample with `inputTexture.sample(...)`), false/omit to generate imagery from scratch.",
  name: "write_custom_shader",
}

export default function writeCustomShader(args: InferSchema<typeof schema>) {
  return proxy("write_custom_shader", args, WRITE_SHADER_TIMEOUT_MS)
}
