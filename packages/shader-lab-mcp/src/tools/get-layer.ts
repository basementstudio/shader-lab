import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  id: z.string().describe("Layer id"),
}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Get layer",
  },
  description:
    "Get one layer with its full parameter values (including custom shader source).",
  name: "get_layer",
}

export default function getLayer(args: InferSchema<typeof schema>) {
  return proxy("get_layer", args)
}
