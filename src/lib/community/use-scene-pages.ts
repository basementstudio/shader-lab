"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { mergeScenePages } from "@/lib/community/merge-scenes"
import type { CommunitySceneSummary, SceneSort } from "@/lib/community/scenes"
import type { LayerType } from "@/types/editor"

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

export function sceneListKey(
  sort: SceneSort,
  query: string,
  author?: string | null,
  layer?: LayerType | null
): string {
  return `${author ?? ""}|${sort}|${query.trim().toLowerCase()}|${layer ?? ""}`
}

export function sceneListUrl(input: {
  author?: string | null
  cursor?: string | null
  limit?: number
  query?: string
  sort: SceneSort
  layer?: LayerType | null
}): string {
  const params = new URLSearchParams({
    limit: String(input.limit ?? SCENE_PAGE_SIZE),
    sort: input.sort,
  })

  const query = input.query?.trim() ?? ""

  if (query.length > 0) {
    params.set("q", query)
  }

  if (input.author) {
    params.set("author", input.author)
  }

  if (input.layer) {
    params.set("layer", input.layer)
  }

  if (input.cursor) {
    params.set("cursor", input.cursor)
  }

  return `/api/community/scenes?${params.toString()}`
}

async function fetchScenePage(url: string): Promise<CachedPage> {
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Scene request failed (${res.status}).`)
  }

  const data = (await res.json()) as ScenePageResponse

  return { nextCursor: data.nextCursor ?? null, scenes: data.scenes ?? [] }
}

export interface ScenePageAppendRequest {
  fetchPage: () => Promise<CachedPage>
  isStale: () => boolean
  key: string
  remember: (key: string, page: CachedPage) => void
  setError: (error: boolean) => void
  setNextCursor: (cursor: string | null) => void
  setScenes: (
    update: (current: CommunitySceneSummary[] | null) => CommunitySceneSummary[]
  ) => void
  settle: () => void
}

export async function appendNextScenePage(
  request: ScenePageAppendRequest
): Promise<void> {
  try {
    const page = await request.fetchPage()

    if (request.isStale()) {
      return
    }

    request.setScenes((current) => {
      const merged = mergeScenePages(current ?? [], page.scenes)

      request.remember(request.key, {
        nextCursor: page.nextCursor,
        scenes: merged,
      })

      return merged
    })
    request.setNextCursor(page.nextCursor)
  } catch {
    if (!request.isStale()) {
      request.setError(true)
    }
  } finally {
    request.settle()
  }
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
  author?: string | null
  enabled?: boolean
  initial?: CachedPage | null
  query?: string
  sort: SceneSort
  layer?: LayerType | null
}): ScenePagesState {
  const enabled = input.enabled ?? true
  const query = input.query ?? ""
  const { sort } = input
  const author = input.author ?? null
  const layer = input.layer ?? null
  const key = sceneListKey(sort, query, author, layer)

  const cache = useRef(new Map<string, CachedPage>())
  const inFlight = useRef<string | null>(null)
  const pending = useRef(new Map<string, Promise<CachedPage>>())
  const visibleKey = useRef(key)

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
    visibleKey.current = key
  }, [key])

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

    let cancelled = false

    setScenes(null)
    setNextCursor(null)
    setError(false)

    let request = pending.current.get(key)

    if (!request) {
      request = fetchScenePage(sceneListUrl({ author, layer, query, sort }))
        .then((page) => {
          remember(key, page)

          return page
        })
        .finally(() => {
          pending.current.delete(key)
        })

      pending.current.set(key, request)
    }

    request
      .then((page) => {
        if (!cancelled) {
          setScenes(page.scenes)
          setNextCursor(page.nextCursor)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [author, enabled, key, layer, query, remember, sort])

  const loadMore = useCallback(() => {
    if (!(enabled && nextCursor)) {
      return
    }

    const token = `${key}|${nextCursor}`

    if (inFlight.current === token) {
      return
    }

    inFlight.current = token
    setLoading(true)
    setError(false)

    void appendNextScenePage({
      fetchPage: () =>
        fetchScenePage(
          sceneListUrl({ author, cursor: nextCursor, layer, query, sort })
        ),
      isStale: () => visibleKey.current !== key,
      key,
      remember,
      setError,
      setNextCursor,
      setScenes,
      settle: () => {
        if (inFlight.current !== token) {
          return
        }

        inFlight.current = null
        setLoading(false)
      },
    })
  }, [author, enabled, key, layer, nextCursor, query, remember, sort])

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
