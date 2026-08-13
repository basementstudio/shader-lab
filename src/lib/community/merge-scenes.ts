import type { CommunitySceneSummary } from "@/lib/community/scenes"

export function mergeScenePages<T extends CommunitySceneSummary>(
  current: readonly T[],
  incoming: readonly T[]
): T[] {
  if (incoming.length === 0) {
    return current as T[]
  }

  const seen = new Set(current.map((scene) => scene.slug))
  const added = incoming.filter((scene) => {
    if (seen.has(scene.slug)) {
      return false
    }

    seen.add(scene.slug)

    return true
  })

  return added.length === 0 ? (current as T[]) : [...current, ...added]
}
