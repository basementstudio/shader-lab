function unwrap(value: string): string {
  const trimmed = value.trim()

  for (const quote of ['"', "'"]) {
    if (
      trimmed.length >= 2 &&
      trimmed.startsWith(quote) &&
      trimmed.endsWith(quote)
    ) {
      return trimmed.slice(1, -1).trim()
    }
  }

  return trimmed
}

function firstValue(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]

    if (value === undefined) {
      continue
    }

    const unwrapped = unwrap(value)

    if (unwrapped) {
      return unwrapped
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
    const value = process.env[name]

    if (value !== undefined && unwrap(value)) {
      return name
    }
  }

  return null
}
