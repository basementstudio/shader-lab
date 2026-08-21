import { connection } from "next/server"
import { getAuthConfig, getOptionalSession } from "@/lib/auth/server"
import { isAuthTraceEnabled, neonCookieNames } from "@/lib/auth/trace"

export async function GET(request: Request) {
  await connection()

  if (!isAuthTraceEnabled()) {
    return Response.json({ error: "Not enabled." }, { status: 404 })
  }

  const cookieHeader = request.headers.get("cookie")
  const names = neonCookieNames(cookieHeader)
  const session = await getOptionalSession()

  return Response.json({
    authConfigured: getAuthConfig() !== null,
    cookies: {
      hasChallenge: names.some((name) => name.includes("session_chall")),
      hasSessionData: names.some((name) => name.includes("session_data")),
      hasSessionToken: names.some((name) => name.includes("session_token")),
      neonCookieNames: names,
    },
    host: new URL(request.url).host,
    session: session ? { email: session.user.email, id: session.user.id } : null,
  })
}
