"use client"

import { useEffect, useEffectEvent } from "react"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { requestDraftSave } from "@/lib/editor/draft-save-bus"
import { isEditableTarget } from "@/lib/editor/is-editable-target"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

export function EditorShortcuts() {
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const removeLayers = useLayerStore((state) => state.removeLayers)
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const enterImmersiveCanvas = useEditorStore(
    (state) => state.enterImmersiveCanvas
  )
  const exitImmersiveCanvas = useEditorStore(
    (state) => state.exitImmersiveCanvas
  )
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const selectedKeyframeIds = useTimelineStore(
    (state) => state.selectedKeyframeIds
  )
  const togglePlaying = useTimelineStore((state) => state.togglePlaying)

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault()
      requestDraftSave({ asNewDraft: event.shiftKey })

      return
    }

    if (
      event.metaKey &&
      !event.altKey &&
      !event.ctrlKey &&
      event.code === "Period"
    ) {
      event.preventDefault()

      if (immersiveCanvas) {
        exitImmersiveCanvas()
      } else {
        enterImmersiveCanvas()
        playUISound("action.hideUI")
      }

      return
    }

    if (
      event.key.toLowerCase() === "p" &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      const playing = useTimelineStore.getState().isPlaying
      togglePlaying()
      playUISound(playing ? "action.pause" : "action.play")
      return
    }

    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      selectedLayerIds.length > 0 &&
      !(timelinePanelOpen && selectedKeyframeIds.length > 0)
    ) {
      event.preventDefault()
      removeLayers(selectedLayerIds)
      playUISound("action.deleteLayer")
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
