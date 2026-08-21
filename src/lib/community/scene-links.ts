export const OPEN_IN_EDITOR_PARAM = "open"

export const EDITOR_PATH = "/tools/shader-lab"

export const COMMUNITY_PATH = `${EDITOR_PATH}/community`

export function editorSceneHref(slug: string): string {
  return `${EDITOR_PATH}?scene=${encodeURIComponent(slug)}`
}

export function scenePagePath(slug: string): string {
  return `${COMMUNITY_PATH}/${slug}`
}

export function sceneSharePath(slug: string): string {
  return `${scenePagePath(slug)}?${OPEN_IN_EDITOR_PARAM}=1`
}

export function profilePagePath(handle: string): string {
  return `${COMMUNITY_PATH}/u/${handle}`
}

export function profileDisplayPath(handle: string): string {
  return profilePagePath(handle).slice(EDITOR_PATH.length)
}
