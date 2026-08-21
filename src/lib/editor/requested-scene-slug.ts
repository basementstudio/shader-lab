export function getRequestedSceneSlug(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  return new URLSearchParams(window.location.search).get("scene")
}

export function clearRequestedSceneSlug(): void {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)

  if (!url.searchParams.has("scene")) {
    return
  }

  url.searchParams.delete("scene")
  window.history.replaceState(null, "", url.toString())
}
