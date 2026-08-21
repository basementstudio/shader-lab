export const COMMUNITY_FEED_TAG = "community-feed"

export function authorTag(userId: string): string {
  return `author:${userId}`
}

export function profileHandleTag(handle: string): string {
  return `profile-handle:${handle}`
}

export function sceneTag(slug: string): string {
  return `scene:${slug}`
}
