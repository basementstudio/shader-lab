import { NextResponse } from "next/server"
import { APP_BASE_URL } from "@/lib/app"

const MD_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
  "X-Content-Type-Options": "nosniff",
} as const

/** `canonicalPath` is appended to the base URL; omit when there's no HTML twin. */
export function markdownResponse(markdown: string, canonicalPath?: string) {
  return new NextResponse(markdown, {
    headers:
      canonicalPath === undefined
        ? MD_HEADERS
        : {
            ...MD_HEADERS,
            Link: `<${APP_BASE_URL}${canonicalPath}>; rel="canonical"`,
          },
  })
}

export function markdownNotFoundResponse() {
  return new NextResponse("# 404\n\nNot found.\n", {
    headers: MD_HEADERS,
    status: 404,
  })
}
