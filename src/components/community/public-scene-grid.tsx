"use client"

import { PublicSceneCard } from "@/components/community/public-scene-card"
import { SCENE_GRID_CLASS_NAME } from "@/components/community/scene-grid"
import { SceneLoadMore } from "@/components/community/scene-load-more"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary, SceneSort } from "@/lib/community/scenes"
import { useScenePages } from "@/lib/community/use-scene-pages"
import type { EffectLayerType } from "@/types/editor"

export function PublicSceneGrid({
  author,
  emptyLabel = "No scenes published yet.",
  initialNextCursor,
  initialScenes,
  showAuthor = true,
  sort = "popular",
  effect,
}: {
  author?: string | null
  emptyLabel?: string
  initialNextCursor: string | null
  initialScenes: CommunitySceneSummary[]
  showAuthor?: boolean
  sort?: SceneSort
  effect?: EffectLayerType
}) {
  const { error, hasMore, loadMore, loading, scenes } = useScenePages({
    author: author ?? null,
    initial: { nextCursor: initialNextCursor, scenes: initialScenes },
    sort,
    effect: effect ?? null,
  })

  const shown = scenes ?? initialScenes

  if (shown.length === 0) {
    return (
      <Typography as="p" tone="secondary" variant="body">
        {emptyLabel}
      </Typography>
    )
  }

  return (
    <>
      <div className={SCENE_GRID_CLASS_NAME}>
        {shown.map((scene, index) => (
          <PublicSceneCard
            key={scene.slug}
            priority={index < 3}
            scene={scene}
            showAuthor={showAuthor}
          />
        ))}
      </div>

      <SceneLoadMore
        error={error}
        hasMore={hasMore}
        loadMore={loadMore}
        loading={loading}
        total={shown.length}
      />
    </>
  )
}
