import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id to duplicate"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Duplicate layer",
  },
  description:
    "Duplicate a layer (copy is inserted right after the source layer).",
  name: "duplicate_layer",
}

export default function duplicateLayer(args: InferSchema<typeof schema>) {
  return proxy("duplicate_layer", args)
}
