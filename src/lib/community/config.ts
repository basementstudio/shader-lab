import { resolveAuthBaseUrl, resolveDatabaseUrl } from "@/lib/community/env"

export type CommunityCapability = "auth" | "database" | "media" | "turnstile"

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl() !== null
}

export function isAuthConfigured(): boolean {
  return (
    resolveAuthBaseUrl() !== null &&
    hasValue(process.env.NEON_AUTH_COOKIE_SECRET)
  )
}

export function isMediaConfigured(): boolean {
  return (
    hasValue(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    hasValue(process.env.R2_BUCKET) &&
    hasValue(process.env.R2_ACCESS_KEY_ID) &&
    hasValue(process.env.R2_SECRET_ACCESS_KEY)
  )
}

export function isTurnstileConfigured(): boolean {
  return hasValue(process.env.TURNSTILE_SECRET_KEY)
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
  return (process.env.COMMUNITY_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()

  if (!normalized) {
    return false
  }

  const allowed = getAdminEmails()

  return allowed.length > 0 && allowed.includes(normalized)
}
