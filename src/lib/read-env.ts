export function unwrapEnvValue(value: string): string {
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

export function readEnv(name: string): string | null {
  const value = process.env[name]

  if (value === undefined) {
    return null
  }

  const unwrapped = unwrapEnvValue(value)

  return unwrapped.length > 0 ? unwrapped : null
}

export function readEnvList(name: string): string[] {
  const value = readEnv(name)

  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((entry) =>
      entry
        .trim()
        .replace(/^["']+|["']+$/g, "")
        .trim()
    )
    .filter((entry) => entry.length > 0)
}
