import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { errorResult, textResult } from "../lib/proxy"
import {
  getShaderApiReference,
  SHADER_REFERENCE_SECTIONS,
} from "../lib/shader-reference"

export const schema = {
  section: z
    .enum(SHADER_REFERENCE_SECTIONS)
    .optional()
    .describe("Section to expand; omit for the overview"),
}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Shader API reference",
  },
  description:
    "The custom shader API reference. Without a section: the shader contract plus a grouped index of every global (house utils + three/tsl). With a section (noise, color, patterns, sdf, complex, math, tsl-core, examples): full util sources or the complete TSL export list.",
  name: "get_shader_api_reference",
}

export default async function shaderApiReference(
  args: InferSchema<typeof schema>
) {
  try {
    return textResult(await getShaderApiReference(args.section))
  } catch (error) {
    return errorResult(error)
  }
}
