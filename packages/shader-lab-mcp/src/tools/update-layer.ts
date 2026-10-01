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
  mask: z
    .object({
      shape: z
        .enum(["none", "linear", "radial", "ellipse", "rectangle", "brush"])
        .optional(),
      scope: z.enum(["effect", "content"]).optional(),
      enabled: z.boolean().optional(),
      invert: z.boolean().optional(),
      center: z.tuple([z.number(), z.number()]).optional(),
      size: z.tuple([z.number(), z.number()]).optional(),
      rotation: z.number().optional(),
      feather: z.number().optional(),
      paint: z.string().optional(),
    })
    .nullable()
    .optional()
    .describe(
      "Reusable layer mask in centered shorter-edge composition units (y down). shape none disables it; scope effect limits the effect, content cuts coverage (effects only). Pass null to reset."
    ),
  opacity: z.number().optional(),
  saturation: z.number().optional(),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Update layer",
  },
  description:
    "Update layer-level properties: opacity (0-1), hue (-180 to 180), saturation (0-2), blendMode, compositeMode, maskConfig, and the reusable mask (gradient, ellipse, rectangle or brush). For effect-specific parameters use update_layer_params.",
  name: "update_layer",
}

export default function updateLayer(args: InferSchema<typeof schema>) {
  return proxy("update_layer", args)
}
