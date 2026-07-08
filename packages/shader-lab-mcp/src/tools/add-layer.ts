import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  insertIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Position in the stack; omit for index 0 (top)"),
  name: z.string().optional().describe("Optional custom layer name"),
  type: z.string().describe("Layer type from list_layer_types"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Add layer",
  },
  description:
    "Add a new layer. Without insertIndex it goes to index 0 (top of the stack — applied last, so an effect added there transforms everything below it). The new layer is returned with its default params and becomes selected.",
  name: "add_layer",
}

export default function addLayer(args: InferSchema<typeof schema>) {
  return proxy("add_layer", args)
}
