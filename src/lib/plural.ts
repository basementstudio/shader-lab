const SIBILANT_ENDING = /(?:s|x|z|ch|sh)$/i

export function pluralize(
  count: number,
  singular: string,
  plural = SIBILANT_ENDING.test(singular) ? `${singular}es` : `${singular}s`
): string {
  return count === 1 ? singular : plural
}

export function countLabel(
  count: number,
  singular: string,
  plural?: string
): string {
  return `${count} ${pluralize(count, singular, plural)}`
}
