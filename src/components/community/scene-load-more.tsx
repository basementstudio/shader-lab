"use client"

import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"

export function SceneLoadMore({
  error,
  hasMore,
  loadMore,
  loading,
  total,
}: {
  error: boolean
  hasMore: boolean
  loadMore: () => void
  loading: boolean
  total: number
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current

    if (!(sentinel && hasMore) || error) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      { rootMargin: "320px" }
    )

    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [error, hasMore, loadMore])

  if (!(hasMore || error)) {
    return null
  }

  return (
    <div className="flex flex-col items-center gap-[var(--ds-space-2)] py-[var(--ds-space-4)]">
      <div aria-hidden="true" className="h-px w-full" ref={sentinelRef} />

      <output aria-live="polite" className="sr-only">
        {loading ? "Loading more scenes" : `${total} scenes loaded`}
      </output>

      <Button
        disabled={loading}
        onClick={loadMore}
        size="compact"
        variant="secondary"
      >
        {loading ? "Loading…" : "Load more"}
      </Button>

      {error ? (
        <Typography align="center" as="p" tone="tertiary" variant="caption">
          Could not load more scenes.
        </Typography>
      ) : null}
    </div>
  )
}
