import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { z } from "zod"
import type { InferSchema, ToolMetadata } from "xmcp"
import { getBridge } from "../lib/bridge"
import { errorResult, textResult } from "../lib/proxy"

const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const ADD_MEDIA_TIMEOUT_MS = 30_000

export const schema = {
  base64: z
    .string()
    .optional()
    .describe("Raw media bytes as base64 (alternative to path)"),
  fileName: z
    .string()
    .optional()
    .describe("File name with extension; required with base64, inferred from path"),
  insertIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Position in the stack; omit for index 0 (top)"),
  name: z.string().optional().describe("Optional custom layer name"),
  path: z
    .string()
    .optional()
    .describe(
      "Absolute path to an image or video on this machine (png, jpg, webp, gif, svg, mp4, webm, mov)"
    ),
}

export const metadata: ToolMetadata = {
  annotations: {
    title: "Add media layer",
  },
  description:
    "Create an image or video layer from a local file path (read on this machine) or base64 data. The asset is loaded into the editor and attached to a new layer of the matching type.",
  name: "add_media_layer",
}

export default async function addMediaLayer(args: InferSchema<typeof schema>) {
  let base64 = args.base64
  let fileName = args.fileName

  if (args.path) {
    try {
      const bytes = await readFile(args.path)

      if (bytes.byteLength > MAX_MEDIA_BYTES) {
        return errorResult(
          new Error(
            `File is too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`
          )
        )
      }

      base64 = bytes.toString("base64")
      fileName = fileName ?? basename(args.path)
    } catch (error) {
      return errorResult(
        new Error(
          `Could not read \`${args.path}\`: ${error instanceof Error ? error.message : String(error)}`
        )
      )
    }
  }

  if (!(base64 && fileName)) {
    return errorResult(
      new Error("Provide either `path`, or `base64` together with `fileName`.")
    )
  }

  try {
    const result = await getBridge().request(
      "add_media_layer",
      {
        base64,
        fileName,
        insertIndex: args.insertIndex,
        name: args.name,
      },
      ADD_MEDIA_TIMEOUT_MS
    )

    return textResult(result)
  } catch (error) {
    return errorResult(error)
  }
}
