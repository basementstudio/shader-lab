import { createNeonAuth } from "@neondatabase/auth/next/server"

export interface NeonAuthConfigValues {
  baseUrl: string
  cookies: { secret: string }
}

export function getAuthConfig(): NeonAuthConfigValues | null {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim()
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim()

  if (!(baseUrl && secret)) {
    return null
  }

  return { baseUrl, cookies: { secret } }
}

let cached: ReturnType<typeof createNeonAuth> | null = null

export function getAuth() {
  const config = getAuthConfig()

  if (!config) {
    throw new Error(
      "Neon Auth is not configured. Guard callers with isCommunityEnabled()."
    )
  }

  if (!cached) {
    cached = createNeonAuth(config)
  }

  return cached
}

export interface CommunitySessionUser {
  email: string | null
  id: string
  image: string | null
  name: string | null
}

export interface CommunitySession {
  user: CommunitySessionUser
}

function unwrapSession(result: unknown): CommunitySession | null {
  const payload =
    result && typeof result === "object" && "data" in result
      ? (result as { data: unknown }).data
      : result

  if (!(payload && typeof payload === "object" && "user" in payload)) {
    return null
  }

  const user = (payload as { user: unknown }).user

  if (!(user && typeof user === "object" && "id" in user)) {
    return null
  }

  const record = user as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id : null

  if (!id) {
    return null
  }

  return {
    user: {
      email: typeof record.email === "string" ? record.email : null,
      id,
      image: typeof record.image === "string" ? record.image : null,
      name: typeof record.name === "string" ? record.name : null,
    },
  }
}

export async function getOptionalSession(): Promise<CommunitySession | null> {
  if (!getAuthConfig()) {
    return null
  }

  try {
    return unwrapSession(await getAuth().getSession())
  } catch {
    return null
  }
}
