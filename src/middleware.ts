import { type NextRequest, NextResponse } from "next/server"
import { getAuth, getAuthConfig } from "@/lib/auth/server"
import { authTrace, neonCookieNames, setCookieNames } from "@/lib/auth/trace"
import { COMMUNITY_PATH } from "@/lib/community/scene-links"

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

  const response = await getAuth().middleware({ loginUrl: COMMUNITY_PATH })(
    request
  )

  authTrace("middleware:out", {
    location: response.headers.get("location"),
    setCookie: setCookieNames(response.headers),
    status: response.status,
  })

  return response
}

// loginUrl must never match a path this matcher covers: the SDK's middleware
// treats its own login page as already-allowed and returns before it attempts
// the OAuth token exchange. /auth/callback is in the SDK's default skip list,
// so route protection cannot apply to it regardless.
export const config = { matcher: ["/auth/callback"] }
