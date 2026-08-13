"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { mergeScenePages } from "@/lib/community/merge-scenes"
import type { CommunitySceneSummary, SceneSort } from "@/lib/community/scenes"

export const SCENE_PAGE_SIZE = 24

const MAX_CACHED_PAGES = 12

interface ScenePageResponse {
  nextCursor?: string | null
  scenes?: CommunitySceneSummary[]
}

interface CachedPage {
  nextCursor: string | null
  scenes: CommunitySceneSummary[]
}

export function sceneListKey(sort: SceneSort, query: string): string {
  return `${sort}|${query.trim().toLowerCase()}`
}

export function sceneListUrl(input: {
  cursor?: string | null
  limit?: number
  query?: string
  sort: SceneSort
}): string {
  const params = new URLSearchParams({
    limit: String(input.limit ?? SCENE_PAGE_SIZE),
    sort: input.sort,
  })

  const query = input.query?.trim() ?? ""

  if (query.length > 0) {
    params.set("q", query)
  }

  if (input.cursor) {
    params.set("cursor", input.cursor)
  }

  return `/api/community/scenes?${params.toString()}`
}

export interface ScenePagesState {
  error: boolean
  hasMore: boolean
  loadMore: () => void
  loading: boolean
  patch: (slug: string, changes: Partial<CommunitySceneSummary>) => void
  remove: (slug: string) => void
  scenes: CommunitySceneSummary[] | null
}

export function useScenePages(input: {
  enabled?: boolean
  initial?: CachedPage | null
  query?: string
  sort: SceneSort
}): ScenePagesState {
  const enabled = input.enabled ?? true
  const query = input.query ?? ""
  const { sort } = input
  const key = sceneListKey(sort, query)

  const cache = useRef(new Map<string, CachedPage>())
  const inFlight = useRef<string | null>(null)
  const loadingKey = useRef<string | null>(null)

  if (input.initial && !cache.current.has(key)) {
    cache.current.set(key, input.initial)
  }

  const [scenes, setScenes] = useState<CommunitySceneSummary[] | null>(
    input.initial?.scenes ?? null
  )
  const [nextCursor, setNextCursor] = useState<string | null>(
    input.initial?.nextCursor ?? null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const remember = useCallback((cacheKey: string, page: CachedPage) => {
    if (
      cache.current.size >= MAX_CACHED_PAGES &&
      !cache.current.has(cacheKey)
    ) {
      const oldest = cache.current.keys().next().value

      if (oldest !== undefined) {
        cache.current.delete(oldest)
      }
    }

    cache.current.set(cacheKey, page)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const cached = cache.current.get(key)

    if (cached) {
      setScenes(cached.scenes)
      setNextCursor(cached.nextCursor)
      setError(false)

      return
    }

    if (loadingKey.current === key) {
      return
    }

    let cancelled = false

    loadingKey.current = key
    setScenes(null)
    setNextCursor(null)
    setError(false)

    fetch(sceneListUrl({ query, sort }))
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("failed"))
      )
      .then((data: ScenePageResponse) => {
        if (cancelled) {
          return
        }

        const page = {
          nextCursor: data.nextCursor ?? null,
          scenes: data.scenes ?? [],
        }

        remember(key, page)
        setScenes(page.scenes)
        setNextCursor(page.nextCursor)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
        }
      })
      .finally(() => {
        if (loadingKey.current === key) {
          loadingKey.current = null
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, key, query, remember, sort])

  const loadMore = useCallback(() => {
    if (!(enabled && nextCursor) || inFlight.current === nextCursor) {
      return
    }

    inFlight.current = nextCursor
    setLoading(true)
    setError(false)

    void fetch(sceneListUrl({ cursor: nextCursor, query, sort }))
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("failed"))
      )
      .then((data: ScenePageResponse) => {
        setScenes((current) => {
          const merged = mergeScenePages(current ?? [], data.scenes ?? [])

          remember(key, { nextCursor: data.nextCursor ?? null, scenes: merged })

          return merged
        })
        setNextCursor(data.nextCursor ?? null)
      })
      .catch(() => setError(true))
      .finally(() => {
        inFlight.current = null
        setLoading(false)
      })
  }, [enabled, key, nextCursor, query, remember, sort])

  const patch = useCallback(
    (slug: string, changes: Partial<CommunitySceneSummary>) => {
      const apply = (scene: CommunitySceneSummary) =>
        scene.slug === slug ? { ...scene, ...changes } : scene

      for (const [cacheKey, page] of cache.current) {
        cache.current.set(cacheKey, {
          nextCursor: page.nextCursor,
          scenes: page.scenes.map(apply),
        })
      }

      setScenes((current) => (current ? current.map(apply) : current))
    },
    []
  )

  const remove = useCallback((slug: string) => {
    for (const [cacheKey, page] of cache.current) {
      cache.current.set(cacheKey, {
        nextCursor: page.nextCursor,
        scenes: page.scenes.filter((scene) => scene.slug !== slug),
      })
    }

    setScenes((current) =>
      current ? current.filter((scene) => scene.slug !== slug) : current
    )
  }, [])

  return {
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    loading,
    patch,
    remove,
    scenes,
  }
}
