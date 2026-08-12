import { getAuth, getAuthConfig } from "@/lib/auth/server"

type Params = { params: Promise<{ path: string[] }> }

type Method = "DELETE" | "GET" | "PATCH" | "POST" | "PUT"

function unavailable() {
  return Response.json(
    {
      error:
        "Auth is not configured on this deployment. NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are required.",
    },
    { status: 503 }
  )
}

function handle(method: Method) {
  return async (request: Request, context: Params): Promise<Response> => {
    if (!getAuthConfig()) {
      return unavailable()
    }

    const handler = getAuth().handler()[method]

    return await handler(request, context)
  }
}

export const GET = handle("GET")
export const POST = handle("POST")
export const PUT = handle("PUT")
export const DELETE = handle("DELETE")
export const PATCH = handle("PATCH")
