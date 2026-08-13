import { resolveAuthBaseUrl, resolveDatabaseUrl } from "@/lib/community/env"
import { readEnv, readEnvList } from "@/lib/read-env"

export type CommunityCapability = "auth" | "database" | "media" | "turnstile"

function hasValue(name: string): boolean {
  return readEnv(name) !== null
}

export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl() !== null
}

export function isAuthConfigured(): boolean {
  return resolveAuthBaseUrl() !== null && hasValue("NEON_AUTH_COOKIE_SECRET")
}

export function isMediaConfigured(): boolean {
  return (
    hasValue("CLOUDFLARE_ACCOUNT_ID") &&
    hasValue("R2_BUCKET") &&
    hasValue("R2_ACCESS_KEY_ID") &&
    hasValue("R2_SECRET_ACCESS_KEY")
  )
}

export function isTurnstileConfigured(): boolean {
  return hasValue("TURNSTILE_SECRET_KEY")
}

export function isCommunityEnabled(): boolean {
  return isDatabaseConfigured() && isAuthConfigured()
}

export function getMissingCommunityCapabilities(): CommunityCapability[] {
  const missing: CommunityCapability[] = []

  if (!isDatabaseConfigured()) {
    missing.push("database")
  }

  if (!isAuthConfigured()) {
    missing.push("auth")
  }

  if (!isMediaConfigured()) {
    missing.push("media")
  }

  if (!isTurnstileConfigured()) {
    missing.push("turnstile")
  }

  return missing
}

export function getAdminEmails(): string[] {
  return readEnvList("COMMUNITY_ADMIN_EMAILS").map((entry) =>
    entry.toLowerCase()
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  const allowed = getAdminEmails()

  return allowed.length > 0 && allowed.includes(normalized)
}
