import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().optional().describe("Layer id; omit to deselect"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Select layer",
  },
  description:
    "Select a layer in the editor UI (or pass no id to clear the selection). Useful to show the user what you are working on.",
  name: "select_layer",
}

export default function selectLayer(args: InferSchema<typeof schema>) {
  return proxy("select_layer", args)
}
