import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id"),
  params: z
    .record(z.string(), z.unknown())
    .describe("Key/value pairs from describe_layer_type"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Update layer params",
  },
  description:
    "Update effect parameters on a layer. Values are validated against the layer's schema: out-of-range numbers are clamped (and reported), unknown keys and wrong types are rejected with reasons. The response lists applied/clamped/rejected keys plus the resulting layer.",
  name: "update_layer_params",
}

export default function updateLayerParams(args: InferSchema<typeof schema>) {
  return proxy("update_layer_params", args)
}
