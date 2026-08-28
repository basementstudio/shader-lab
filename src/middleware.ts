import { type NextRequest, NextResponse } from "next/server"
import { getAuth, getAuthConfig } from "@/lib/auth/server"
import { authTrace, neonCookieNames, setCookieNames } from "@/lib/auth/trace"
import { COMMUNITY_PATH } from "@/lib/community/scene-links"

const SCENE_MD_REGEX = /^\/tools\/shader-lab\/community\/([^/]+)\.md$/
const SCENE_HTML_REGEX = /^\/tools\/shader-lab\/community\/([^/]+)$/

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  const url = new URL(request.url)

  if (url.pathname.startsWith(COMMUNITY_PATH)) {
    return communityMarkdown(request, url.pathname)
  }

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

/**
 * Serves markdown twins of scene pages for AI agents / LLMs:
 *
 *   1. `/community/<slug>.md`                       → rewrite to the md route
 *   2. `/community/<slug>` + `Accept: text/markdown` → rewrite (negotiation)
 *   3. `/community/<slug>` (HTML)                   → advertise the alternate
 *
 * The community index and `/community/u/<handle>` profiles have no twins and
 * fall through untouched.
 */
function communityMarkdown(
  request: NextRequest,
  pathname: string
): NextResponse {
  const mdMatch = SCENE_MD_REGEX.exec(pathname)

  if (mdMatch?.[1]) {
    return rewriteToSceneMarkdown(request, mdMatch[1])
  }

  const htmlMatch = SCENE_HTML_REGEX.exec(pathname)
  const slug = htmlMatch?.[1]

  if (!slug || slug === "u") {
    return NextResponse.next()
  }

  if ((request.headers.get("accept") ?? "").includes("text/markdown")) {
    return rewriteToSceneMarkdown(request, slug)
  }

  const response = NextResponse.next()

  response.headers.set(
    "Link",
    `<${pathname}.md>; rel="alternate"; type="text/markdown"`
  )
  response.headers.set("Vary", "Accept")

  return response
}

function rewriteToSceneMarkdown(
  request: NextRequest,
  slug: string
): NextResponse {
  const url = request.nextUrl.clone()

  url.pathname = `/api/md/scenes/${slug}`

  return NextResponse.rewrite(url)
}

// loginUrl must never match a path this matcher covers: the SDK's middleware
// treats its own login page as already-allowed and returns before it attempts
// the OAuth token exchange. /auth/callback is in the SDK's default skip list,
// so route protection cannot apply to it regardless. The community matcher
// exists only for the markdown twins — auth logic never runs on those paths.
export const config = {
  matcher: ["/auth/callback", "/tools/shader-lab/community/:path*"],
}
