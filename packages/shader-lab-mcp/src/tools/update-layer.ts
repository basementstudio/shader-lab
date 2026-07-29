import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { proxy } from "../lib/proxy"

export const schema = {
  blendMode: z.string().optional(),
  compositeMode: z.string().optional(),
  hue: z.number().optional(),
  id: z.string().describe("Layer id"),
  maskConfig: z
    .object({
      invert: z.boolean().optional(),
      mode: z.string().optional(),
      source: z.string().optional(),
    })
    .optional(),
  opacity: z.number().optional(),
  saturation: z.number().optional(),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Update layer",
  },
  description:
    "Update layer-level properties: opacity (0-1), hue (-180 to 180), saturation (0-2), blendMode, compositeMode, and maskConfig. For effect-specific parameters use update_layer_params.",
  name: "update_layer",
}

export default function updateLayer(args: InferSchema<typeof schema>) {
  return proxy("update_layer", args)
}
