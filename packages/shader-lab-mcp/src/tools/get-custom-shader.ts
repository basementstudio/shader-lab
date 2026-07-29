import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  layerId: z.string().describe("Custom shader layer id"),
}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Get custom shader",
  },
  description:
    "Get the current source code, mode, and runtime error state of a custom shader layer.",
  name: "get_custom_shader",
}

export default function getCustomShader(args: InferSchema<typeof schema>) {
  return proxy("get_custom_shader", args)
}
