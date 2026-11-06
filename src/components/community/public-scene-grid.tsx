"use client"

import { PublicSceneCard } from "@/components/community/public-scene-card"
import { SCENE_GRID_CLASS_NAME } from "@/components/community/scene-grid"
import { SceneLoadMore } from "@/components/community/scene-load-more"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary, SceneSort } from "@/lib/community/scenes"
import { useScenePages } from "@/lib/community/use-scene-pages"
import type { EffectLayerType } from "@/types/editor"

const NO_EFFECTS: readonly EffectLayerType[] = []

export function PublicSceneGrid({
  author,
  emptyLabel = "No scenes published yet.",
  initialNextCursor,
  initialScenes,
  showAuthor = true,
  sort = "popular",
  effects = NO_EFFECTS,
}: {
  author?: string | null
  emptyLabel?: string
  initialNextCursor: string | null
  initialScenes: CommunitySceneSummary[] | null
  showAuthor?: boolean
  sort?: SceneSort
  effects?: readonly EffectLayerType[]
}) {
  const { error, hasMore, loadMore, loading, scenes } = useScenePages({
    author: author ?? null,
    initial: initialScenes
      ? { nextCursor: initialNextCursor, scenes: initialScenes }
      : null,
    sort,
    effects,
  })

  const shown = scenes ?? initialScenes

  if (shown === null) {
    if (error) {
      return (
        <Typography as="p" tone="secondary" variant="body">
          Could not load scenes.
        </Typography>
      )
    }

    return <SceneGridSkeleton />
  }

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

const SKELETON_KEYS = ["one", "two", "three", "four", "five", "six"]

export function SceneGridSkeleton() {
  return (
    <div aria-hidden="true" className={`${SCENE_GRID_CLASS_NAME} animate-pulse`}>
      {SKELETON_KEYS.map((key) => (
        <div
          className="aspect-[16/11] rounded-scene-card bg-[var(--ds-color-card)]"
          key={key}
        />
      ))}
    </div>
  )
}
