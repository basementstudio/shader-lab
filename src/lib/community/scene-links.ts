export const OPEN_IN_EDITOR_PARAM = "open"

export function editorSceneHref(slug: string): string {
  return `/tools/shader-lab?scene=${encodeURIComponent(slug)}`
}

export function scenePagePath(slug: string): string {
  return `/community/${slug}`
}

export function sceneSharePath(slug: string): string {
  return `${scenePagePath(slug)}?${OPEN_IN_EDITOR_PARAM}=1`
}

export function profilePagePath(handle: string): string {
  return `/u/${handle}`
}
