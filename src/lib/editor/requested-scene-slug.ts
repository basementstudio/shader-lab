let cached: string | null = null

export function getRequestedSceneSlug(): string | null {
  if (cached !== null || typeof window === "undefined") {
    return cached
  }

  cached = new URLSearchParams(window.location.search).get("scene")

  return cached
}
