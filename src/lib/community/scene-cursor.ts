export interface SceneCursor {
  featuredAt: string | null
  id: string
  likeCount: number
  publishedAt: string
}

const MAX_INT4 = 2_147_483_647

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")

  return atob(padded)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
}

function isBindableCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_INT4
  )
}

export function encodeSceneCursor(cursor: SceneCursor): string {
  return toBase64Url(
    JSON.stringify([
      cursor.publishedAt,
      cursor.likeCount,
      cursor.id,
      cursor.featuredAt,
    ])
  )
}

export function decodeSceneCursor(value: string | null): SceneCursor | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown

    if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > 4) {
      return null
    }

    const [publishedAt, likeCount, id] = parsed
    const featuredAt = parsed.length === 4 ? parsed[3] : null

    const bindable =
      isTimestamp(publishedAt) &&
      isBindableCount(likeCount) &&
      typeof id === "string" &&
      id.length > 0 &&
      (featuredAt === null || isTimestamp(featuredAt))

    if (!bindable) {
      return null
    }

    return { featuredAt, id, likeCount, publishedAt }
  } catch {
    return null
  }
}
