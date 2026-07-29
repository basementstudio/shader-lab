import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { getBridge } from "../lib/bridge"
import { errorResult, SCREENSHOT_TIMEOUT_MS } from "../lib/proxy"

export const schema = {
  maxWidth: z
    .number()
    .int()
    .min(64)
    .max(4096)
    .optional()
    .describe("Max output width in px (default 960)"),
  time: z
    .number()
    .min(0)
    .optional()
    .describe("Timeline time in seconds (default: current time)"),
}

export const metadata: ToolMetadata = {
  annotations: {
    readOnlyHint: true,
    title: "Screenshot",
  },
  description:
    "Render the current composition to a PNG and return it as an image. Use this to see the result of your changes. Renders through the export pipeline (deterministic, full quality) at the current timeline time unless `time` is given.",
  name: "screenshot",
}

export default async function screenshot(args: InferSchema<typeof schema>) {
  try {
    const result = (await getBridge().request(
      "screenshot",
      args,
      SCREENSHOT_TIMEOUT_MS
    )) as {
      base64: string
      height: number
      mimeType: string
      time: number
      width: number
    }

    return {
      content: [
        {
          data: result.base64,
          mimeType: result.mimeType,
          type: "image" as const,
        },
        {
          text: `Rendered ${result.width}x${result.height} at t=${result.time.toFixed(2)}s`,
          type: "text" as const,
        },
      ],
    }
  } catch (error) {
    return errorResult(error)
  }
}
