"use client"

import { useEffect, useEffectEvent } from "react"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

export function EditorShortcuts() {
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const removeLayers = useLayerStore((state) => state.removeLayers)
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const selectedKeyframeId = useTimelineStore(
    (state) => state.selectedKeyframeId
  )
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId)
  const togglePlaying = useTimelineStore((state) => state.togglePlaying)

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    if (
      event.key.toLowerCase() === "p" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      togglePlaying()
      return
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selectedLayerIds.length > 0 &&
      !(timelinePanelOpen && selectedTrackId && selectedKeyframeId)
    ) {
      event.preventDefault()
      removeLayers(selectedLayerIds)
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return null
}
