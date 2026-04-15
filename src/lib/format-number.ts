const DEFAULT_DISPLAY_PRECISION = 12

function normalizeDisplayNumber(
  value: number,
  precision = DEFAULT_DISPLAY_PRECISION
): number {
  if (!Number.isFinite(value)) {
    return value
  }

  return Number.parseFloat(value.toFixed(precision))
}

export function formatNumberForDisplay(value: number): string {
  return normalizeDisplayNumber(value).toString()
}

export function formatNumberForLocale(
  value: number,
  locale: Intl.LocalesArgument,
  options: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(
    normalizeDisplayNumber(value)
  )
}
