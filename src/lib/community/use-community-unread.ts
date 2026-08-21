"use client"

import { useCallback, useEffect, useState } from "react"

export const COMMUNITY_LAST_SEEN_KEY = "shader-lab:community-last-seen"

export function isCommunityUnread(input: {
  lastSeen: string | null
  latestPublishedAt: string | null
}): boolean {
  if (!input.latestPublishedAt) {
    return false
  }

  const latest = Date.parse(input.latestPublishedAt)

  if (Number.isNaN(latest)) {
    return false
  }

  if (!input.lastSeen) {
    return true
  }

  const seen = Date.parse(input.lastSeen)

  return Number.isNaN(seen) ? true : latest > seen
}

function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(COMMUNITY_LAST_SEEN_KEY)
  } catch {
    return null
  }
}

export function useCommunityUnread(enabled: boolean): {
  markSeen: () => void
  unread: boolean
} {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

    fetch("/api/community/latest")
      .then((res) => res.json() as Promise<{ publishedAt?: string | null }>)
      .then((data) => {
        if (!cancelled) {
          setUnread(
            isCommunityUnread({
              lastSeen: readLastSeen(),
              latestPublishedAt: data.publishedAt ?? null,
            })
          )
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [enabled])

  const markSeen = useCallback(() => {
    setUnread(false)

    try {
      window.localStorage.setItem(
        COMMUNITY_LAST_SEEN_KEY,
        new Date().toISOString()
      )
    } catch {
      return
    }
  }, [])

  return { markSeen, unread }
}
