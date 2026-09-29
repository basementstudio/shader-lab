"use client"
import { useEffect, useState } from "react"
import { type ModelClipInfo, parseGltfClips } from "@/lib/editor/model-animation"

const clipCache = new Map<string, Promise<ModelClipInfo[]>>()

function readModelClips(url: string): Promise<ModelClipInfo[]> {
  let pending = clipCache.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((response) => response.arrayBuffer())
      .then(parseGltfClips)
      .catch(() => [])
    clipCache.set(url, pending)
  }
  return pending
}

const NO_CLIPS: readonly ModelClipInfo[] = []

export function useModelClips(url: string | null): readonly ModelClipInfo[] {
  const [state, setState] = useState<{
    clips: readonly ModelClipInfo[]
    url: string | null
  }>({ clips: NO_CLIPS, url: null })

  useEffect(() => {
    if (!url) return
    let active = true
    void readModelClips(url).then((clips) => {
      if (active) setState({ clips, url })
    })
    return () => {
      active = false
    }
  }, [url])

  return url && state.url === url ? state.clips : NO_CLIPS
}
