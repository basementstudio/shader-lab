import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Reset layer params",
  },
  description: "Reset all of a layer's parameters to their defaults.",
  name: "reset_layer_params",
}

export default function resetLayerParams(args: InferSchema<typeof schema>) {
  return proxy("reset_layer_params", args)
}
