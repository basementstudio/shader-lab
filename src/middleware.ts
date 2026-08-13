import { type NextRequest, NextResponse } from "next/server"
import { getAuth, getAuthConfig } from "@/lib/auth/server"

export default async function middleware(
  request: NextRequest
): Promise<NextResponse> {
  if (!getAuthConfig()) {
    return NextResponse.next()
  }

  return await getAuth().middleware({ loginUrl: "/auth/callback" })(request)
}

export const config = { matcher: ["/auth/callback"] }
