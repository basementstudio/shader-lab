import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id"),
  visible: z.boolean(),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Set layer visibility",
  },
  description: "Show or hide a layer.",
  name: "set_layer_visibility",
}

export default function setLayerVisibility(args: InferSchema<typeof schema>) {
  return proxy("set_layer_visibility", args)
}
