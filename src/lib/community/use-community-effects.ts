"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { getCommunityEffectSelection } from "@/lib/community/scene-effect-filter"
import { communityEffectsPath } from "@/lib/community/scene-links"
import type { EffectLayerType } from "@/types/editor"

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("popstate", listener)

  return () => {
    listeners.delete(listener)
    window.removeEventListener("popstate", listener)
  }
}

function getSearch(): string {
  return window.location.search
}

function getServerSearch(): string {
  return ""
}

export function useCommunityEffects(): {
  effects: EffectLayerType[]
  select: (effects: readonly EffectLayerType[]) => void
} {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch)

  const effects = useMemo(
    () =>
      getCommunityEffectSelection(new URLSearchParams(search).getAll("effect")),
    [search]
  )

  const select = useCallback((next: readonly EffectLayerType[]) => {
    window.history.pushState(null, "", communityEffectsPath(next))

    for (const listener of listeners) {
      listener()
    }
  }, [])

  return { effects, select }
}
