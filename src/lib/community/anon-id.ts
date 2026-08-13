const STORAGE_KEY = "shader-lab:community-anon-id"

export function getAnonId(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)

    if (existing && /^[A-Za-z0-9_-]{8,40}$/.test(existing)) {
      return existing
    }

    const fresh = crypto.randomUUID()

    window.localStorage.setItem(STORAGE_KEY, fresh)

    return fresh
  } catch {
    return null
  }
}
