"use client"

import { PublicSceneCard } from "@/components/community/public-scene-card"
import { SceneLoadMore } from "@/components/community/scene-load-more"
import { Typography } from "@/components/ui/typography"
import type { CommunitySceneSummary } from "@/lib/community/scenes"
import { useScenePages } from "@/lib/community/use-scene-pages"

export function PublicSceneGrid({
  initialNextCursor,
  initialScenes,
}: {
  initialNextCursor: string | null
  initialScenes: CommunitySceneSummary[]
}) {
  const { error, hasMore, loadMore, loading, scenes } = useScenePages({
    initial: { nextCursor: initialNextCursor, scenes: initialScenes },
    sort: "popular",
  })

  const shown = scenes ?? initialScenes

  if (shown.length === 0) {
    return (
      <Typography as="p" tone="tertiary" variant="caption">
        No scenes published yet.
      </Typography>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[760px]:grid-cols-4">
        {shown.map((scene, index) => (
          <PublicSceneCard
            key={scene.slug}
            priority={index < 4}
            scene={scene}
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
