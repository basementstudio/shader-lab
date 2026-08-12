import { getAuth, getAuthConfig } from "@/lib/auth/server"

function unavailable() {
  return Response.json(
    { error: "Community features are not configured on this deployment." },
    { status: 503 }
  )
}

const handlers = getAuthConfig() ? getAuth().handler() : null

export const GET = handlers?.GET ?? unavailable
export const POST = handlers?.POST ?? unavailable
export const PUT = handlers?.PUT ?? unavailable
export const DELETE = handlers?.DELETE ?? unavailable
export const PATCH = handlers?.PATCH ?? unavailable
