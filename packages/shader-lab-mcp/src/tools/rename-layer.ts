import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id"),
  name: z.string().min(1).describe("New name"),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Rename layer",
  },
  description: "Rename a layer.",
  name: "rename_layer",
}

export default function renameLayer(args: InferSchema<typeof schema>) {
  return proxy("rename_layer", args)
}
