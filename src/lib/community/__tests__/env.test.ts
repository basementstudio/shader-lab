import { afterEach, describe, expect, test } from "bun:test"
import {
  AUTH_BASE_URL_VARS,
  DATABASE_URL_VARS,
  resolveAuthBaseUrl,
  resolveDatabaseUrl,
  resolvedVarName,
} from "@/lib/community/env"

const KEYS = [
  "COMMUNITY_DATABASE_URL",
  "DATABASE_URL",
  "COMMUNITY_NEON_AUTH_BASE_URL",
  "NEON_AUTH_BASE_URL",
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

function clearAll() {
  for (const key of KEYS) {
    setEnv(key, undefined)
  }
}

const CONNECTION = "postgresql://user:pw@ep-example-pooler.neon.tech/neondb"

describe("resolveDatabaseUrl", () => {
  test("prefers the community override over the platform-managed url", () => {
    clearAll()
    setEnv("DATABASE_URL", "postgresql://user:pw@platform.neon.tech/neondb")
    setEnv("COMMUNITY_DATABASE_URL", CONNECTION)

    expect(resolveDatabaseUrl()).toBe(CONNECTION)
    expect(resolvedVarName(DATABASE_URL_VARS)).toBe("COMMUNITY_DATABASE_URL")
  })

  test("falls back to the platform-managed url", () => {
    clearAll()
    setEnv("DATABASE_URL", CONNECTION)

    expect(resolveDatabaseUrl()).toBe(CONNECTION)
    expect(resolvedVarName(DATABASE_URL_VARS)).toBe("DATABASE_URL")
  })

  test("strips double quotes carried over from a .env file", () => {
    clearAll()
    setEnv("COMMUNITY_DATABASE_URL", `"${CONNECTION}"`)

    const resolved = resolveDatabaseUrl()

    expect(resolved).toBe(CONNECTION)
    expect(new URL(resolved as string).hostname).toBe(
      "ep-example-pooler.neon.tech"
    )
  })

  test("strips single quotes and surrounding whitespace", () => {
    clearAll()
    setEnv("COMMUNITY_DATABASE_URL", `  '${CONNECTION}'  `)

    expect(resolveDatabaseUrl()).toBe(CONNECTION)
  })

  test("treats an empty quoted value as unset and falls through", () => {
    clearAll()
    setEnv("COMMUNITY_DATABASE_URL", '""')
    setEnv("DATABASE_URL", CONNECTION)

    expect(resolveDatabaseUrl()).toBe(CONNECTION)
    expect(resolvedVarName(DATABASE_URL_VARS)).toBe("DATABASE_URL")
  })

  test("returns null when nothing is configured", () => {
    clearAll()

    expect(resolveDatabaseUrl()).toBeNull()
    expect(resolvedVarName(DATABASE_URL_VARS)).toBeNull()
  })

  test("leaves a mismatched leading quote alone rather than corrupting it", () => {
    clearAll()
    setEnv("COMMUNITY_DATABASE_URL", `"${CONNECTION}`)

    expect(resolveDatabaseUrl()).toBe(`"${CONNECTION}`)
  })
})

describe("resolveAuthBaseUrl", () => {
  const AUTH = "https://ep-example.neonauth.neon.tech/neondb/auth"

  test("prefers the community override and strips quotes", () => {
    clearAll()
    setEnv("NEON_AUTH_BASE_URL", "https://platform.neonauth.neon.tech/x/auth")
    setEnv("COMMUNITY_NEON_AUTH_BASE_URL", `"${AUTH}"`)

    expect(resolveAuthBaseUrl()).toBe(AUTH)
    expect(resolvedVarName(AUTH_BASE_URL_VARS)).toBe(
      "COMMUNITY_NEON_AUTH_BASE_URL"
    )
  })

  test("returns null when nothing is configured", () => {
    clearAll()

    expect(resolveAuthBaseUrl()).toBeNull()
  })
})
