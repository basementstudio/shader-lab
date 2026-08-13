import { type NextRequest, NextResponse } from "next/server"
import { getAuth, getAuthConfig } from "@/lib/auth/server"
import { authTrace, neonCookieNames, setCookieNames } from "@/lib/auth/trace"

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  const url = new URL(request.url)

  authTrace("middleware:in", {
    cookies: neonCookieNames(request.headers.get("cookie")),
    host: url.host,
    params: [...url.searchParams.keys()],
    path: url.pathname,
  })

  if (!getAuthConfig()) {
    authTrace("middleware:unconfigured", { path: url.pathname })

    return NextResponse.next()
  }

  const response = await getAuth().middleware({ loginUrl: "/auth/callback" })(
    request
  )

  authTrace("middleware:out", {
    location: response.headers.get("location"),
    setCookie: setCookieNames(response.headers),
    status: response.status,
  })

  return response
}

export const config = { matcher: ["/auth/callback"] }
