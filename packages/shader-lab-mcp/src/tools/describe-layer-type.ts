import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  type: z.string().describe("Layer type, e.g. `halftone` or `gradient`"),
}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Describe layer type",
  },
  description:
    "Get the full parameter schema for a layer type: keys, value types, ranges, step, select options, and defaults. Call this before update_layer_params so values land in range.",
  name: "describe_layer_type",
}

export default function describeLayerType(args: InferSchema<typeof schema>) {
  return proxy("describe_layer_type", args)
}
