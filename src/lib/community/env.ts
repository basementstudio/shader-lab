function firstValue(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim()

    if (value) {
      return value
    }
  }

  return null
}

export const DATABASE_URL_VARS = [
  "COMMUNITY_DATABASE_URL",
  "DATABASE_URL",
] as const

export const AUTH_BASE_URL_VARS = [
  "COMMUNITY_NEON_AUTH_BASE_URL",
  "NEON_AUTH_BASE_URL",
] as const

export function resolveDatabaseUrl(): string | null {
  return firstValue(DATABASE_URL_VARS)
}

export function resolveAuthBaseUrl(): string | null {
  return firstValue(AUTH_BASE_URL_VARS)
}

export function resolvedVarName(names: readonly string[]): string | null {
  for (const name of names) {
    if (process.env[name]?.trim()) {
      return name
    }
  }

  return null
}
