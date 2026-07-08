import { getBridge } from "./bridge"

export const WRITE_SHADER_TIMEOUT_MS = 15_000
export const SCREENSHOT_TIMEOUT_MS = 30_000

interface TextContent {
  text: string
  type: "text"
  [key: string]: unknown
}

interface ImageContent {
  data: string
  mimeType: string
  type: "image"
  [key: string]: unknown
}

export interface ToolResult {
  content: (ImageContent | TextContent)[]
  isError?: boolean
  [key: string]: unknown
}

export function textResult(value: unknown): ToolResult {
  return {
    content: [
      {
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
        type: "text",
      },
    ],
  }
}

export function errorResult(error: unknown): ToolResult {
  return {
    content: [
      {
        text: error instanceof Error ? error.message : String(error),
        type: "text",
      },
    ],
    isError: true,
  }
}

export async function proxy(
  command: string,
  payload: Record<string, unknown>,
  timeoutMs?: number
): Promise<ToolResult> {
  try {
    const result = await getBridge().request(command, payload, timeoutMs)

    return textResult(result)
  } catch (error) {
    return errorResult(error)
  }
}
