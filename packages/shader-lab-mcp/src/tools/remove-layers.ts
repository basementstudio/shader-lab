import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  ids: z.array(z.string()).min(1).describe("Layer ids to remove"),
}

export const metadata: ToolMetadata = {
  annotations: {
    destructiveHint: true,
    title: "Remove layers",
  },
  description: "Remove one or more layers by id.",
  name: "remove_layers",
}

export default function removeLayers(args: InferSchema<typeof schema>) {
  return proxy("remove_layers", args)
}
