import type { SceneSort } from "@/lib/community/scenes"
import type { LayerType } from "@/types/editor"

export const SCENE_GRID_CLASS_NAME =
  "grid grid-cols-1 gap-[var(--ds-space-5)] min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3"

export const FEATURED_MIN_SCENES = 5

export function isFeaturedIndex(
  index: number,
  input: {
    query: string
    sort: SceneSort
    layer?: LayerType | null
    total: number
  }
): boolean {
  if (index !== 0 || input.sort !== "popular") {
    return false
  }

  if (input.query.trim().length > 0) {
    return false
  }

  if (input.layer) {
    return false
  }

  return input.total >= FEATURED_MIN_SCENES
}
