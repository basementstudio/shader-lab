export const AUTH_TRACE_PREFIX = "[auth-trace]"

export function isAuthTraceEnabled(): boolean {
  return process.env.COMMUNITY_AUTH_TRACE === "1"
}

export function neonCookieNames(cookieHeader: string | null): string[] {
  if (!cookieHeader) {
    return []
  }

  return cookieHeader
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim() ?? "")
    .filter((name) => name.includes("neon-auth"))
}

export function setCookieNames(headers: Headers): string[] {
  return headers
    .getSetCookie()
    .map((entry) => entry.split("=")[0]?.trim() ?? "")
    .filter(Boolean)
}

export function authTrace(step: string, detail: Record<string, unknown>) {
  if (!isAuthTraceEnabled()) {
    return
  }

  console.log(`${AUTH_TRACE_PREFIX} ${step} ${JSON.stringify(detail)}`)
}
