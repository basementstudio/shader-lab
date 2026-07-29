import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id to move"),
  toIndex: z.number().int().min(0).describe("Target index"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Reorder layer",
  },
  description:
    "Move a layer to a new index in the stack. Remember: index 0 is the top (applied last), the highest index is the base — effects only affect layers below them (higher indices).",
  name: "reorder_layer",
}

export default function reorderLayer(args: InferSchema<typeof schema>) {
  return proxy("reorder_layer", args)
}
