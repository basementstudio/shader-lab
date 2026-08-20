const DEFAULTS: Record<string, number> = { production: 0.05 }

// Shared by the server and client inits so the two can't drift. Out-of-range
// overrides fall back to the default rather than silently disabling tracing.
export function resolveTracesSampleRate(
  environment: string,
  override: string | undefined
): number {
  const parsed = Number.parseFloat(override ?? "")

  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed
  }

  return DEFAULTS[environment] ?? 0
}
