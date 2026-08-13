export interface SceneCursor {
  id: string
  likeCount: number
  publishedAt: string
}

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

export function encodeSceneCursor(cursor: SceneCursor): string {
  return toBase64Url(
    JSON.stringify([cursor.publishedAt, cursor.likeCount, cursor.id])
  )
}

export function decodeSceneCursor(value: string | null): SceneCursor | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown

    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return null
    }

    const [publishedAt, likeCount, id] = parsed

    if (
      typeof publishedAt !== "string" ||
      typeof likeCount !== "number" ||
      typeof id !== "string" ||
      !Number.isFinite(likeCount) ||
      id.length === 0 ||
      Number.isNaN(Date.parse(publishedAt))
    ) {
      return null
    }

    return { id, likeCount, publishedAt }
  } catch {
    return null
  }
}
