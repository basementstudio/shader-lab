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

export async function getOptionalSession() {
  if (!getAuthConfig()) {
    return null
  }

  try {
    return await getAuth().getSession()
  } catch {
    return null
  }
}
