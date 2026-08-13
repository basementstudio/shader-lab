import { afterEach, describe, expect, test } from "bun:test"
import {
  getAdminEmails,
  getMissingCommunityCapabilities,
  isAdminEmail,
  isCommunityEnabled,
} from "@/lib/community/config"

const KEYS = [
  "NEON_AUTH_BASE_URL",
  "CLOUDFLARE_ACCOUNT_ID",
  "COMMUNITY_ADMIN_EMAILS",
  "DATABASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_BUCKET",
  "R2_SECRET_ACCESS_KEY",
  "TURNSTILE_SECRET_KEY",
] as const

const saved = new Map<string, string | undefined>()

function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) {
    saved.set(key, process.env[key])
  }

  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

function clearAll() {
  for (const key of KEYS) {
    setEnv(key, undefined)
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  saved.clear()
})

describe("isCommunityEnabled", () => {
  test("is disabled when nothing is configured, so a fresh clone still works", () => {
    clearAll()

    expect(isCommunityEnabled()).toBe(false)
  })

  test("stays disabled with a database but no auth", () => {
    clearAll()
    setEnv("DATABASE_URL", "postgres://example")

    expect(isCommunityEnabled()).toBe(false)
  })

  test("stays disabled with auth but no database", () => {
    clearAll()
    setEnv("NEON_AUTH_BASE_URL", "https://x.neonauth.aws.neon.tech/neondb/auth")
    setEnv("NEON_AUTH_COOKIE_SECRET", "cookie-secret")

    expect(isCommunityEnabled()).toBe(false)
  })

  test("needs the cookie secret, not just the auth base url", () => {
    clearAll()
    setEnv("DATABASE_URL", "postgres://example")
    setEnv("NEON_AUTH_BASE_URL", "https://x.neonauth.aws.neon.tech/neondb/auth")

    expect(isCommunityEnabled()).toBe(false)
  })

  test("enables with a database plus a full neon auth config", () => {
    clearAll()
    setEnv("DATABASE_URL", "postgres://example")
    setEnv("NEON_AUTH_BASE_URL", "https://x.neonauth.aws.neon.tech/neondb/auth")
    setEnv("NEON_AUTH_COOKIE_SECRET", "cookie-secret")

    expect(isCommunityEnabled()).toBe(true)
  })

  test("treats whitespace-only values as unset", () => {
    clearAll()
    setEnv("DATABASE_URL", "   ")
    setEnv("NEON_AUTH_BASE_URL", "https://x.neonauth.aws.neon.tech/neondb/auth")
    setEnv("NEON_AUTH_COOKIE_SECRET", "cookie-secret")

    expect(isCommunityEnabled()).toBe(false)
  })
})

describe("getMissingCommunityCapabilities", () => {
  test("reports every unconfigured capability", () => {
    clearAll()

    expect(getMissingCommunityCapabilities().sort()).toEqual([
      "auth",
      "database",
      "media",
      "turnstile",
    ])
  })

  test("media needs the full R2 credential set, not just an account id", () => {
    clearAll()
    setEnv("CLOUDFLARE_ACCOUNT_ID", "acct")
    setEnv("R2_BUCKET", "bucket")

    expect(getMissingCommunityCapabilities()).toContain("media")

    setEnv("R2_ACCESS_KEY_ID", "key")
    setEnv("R2_SECRET_ACCESS_KEY", "secret")

    expect(getMissingCommunityCapabilities()).not.toContain("media")
  })
})

describe("admin allowlist", () => {
  test("parses a comma list and tolerates whitespace", () => {
    clearAll()
    setEnv("COMMUNITY_ADMIN_EMAILS", " a@b.studio , c@d.studio ,, e@f.studio ")

    expect(getAdminEmails()).toEqual([
      "a@b.studio",
      "c@d.studio",
      "e@f.studio",
    ])
  })

  test("nobody is an admin when the allowlist is empty", () => {
    clearAll()

    expect(isAdminEmail("a@b.studio")).toBe(false)
  })

  test("only listed emails are admins", () => {
    clearAll()
    setEnv("COMMUNITY_ADMIN_EMAILS", "a@b.studio,c@d.studio")

    expect(isAdminEmail("a@b.studio")).toBe(true)
    expect(isAdminEmail("c@d.studio")).toBe(true)
    expect(isAdminEmail("nope@b.studio")).toBe(false)
  })

  test("matching ignores case and surrounding whitespace", () => {
    clearAll()
    setEnv("COMMUNITY_ADMIN_EMAILS", "Admin@Basement.Studio")

    expect(isAdminEmail("admin@basement.studio")).toBe(true)
    expect(isAdminEmail("  ADMIN@BASEMENT.STUDIO  ")).toBe(true)
  })

  test("rejects null, undefined and empty emails", () => {
    clearAll()
    setEnv("COMMUNITY_ADMIN_EMAILS", "a@b.studio")

    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
    expect(isAdminEmail("")).toBe(false)
    expect(isAdminEmail("  ")).toBe(false)
  })
})
