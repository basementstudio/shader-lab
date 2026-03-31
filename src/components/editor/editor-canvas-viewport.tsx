"use client"

import { useEffect } from "react"
import { useEditorRenderer } from "@/hooks/use-editor-renderer"
import { useEditorStore } from "@/store/editor-store"
import { applyZoomAtPoint, clampZoom, getWheelZoomFactor } from "@/lib/editor/view-transform"

export function EditorCanvasViewport() {
  const { canvasRef, isReady, viewportRef } = useEditorRenderer()
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const exitImmersiveCanvas = useEditorStore((state) => state.exitImmersiveCanvas)
  const panOffset = useEditorStore((state) => state.panOffset)
  const zoom = useEditorStore((state) => state.zoom)

  useEffect(() => {
    if (!immersiveCanvas) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitImmersiveCanvas()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [exitImmersiveCanvas, immersiveCanvas])

  useEffect(() => {
    const viewportElement = viewportRef.current

    if (!viewportElement) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      const shouldZoom = event.metaKey || event.ctrlKey

      if (!shouldZoom) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const rect = viewportElement.getBoundingClientRect()
      const state = useEditorStore.getState()
      const pointer = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      }
      const nextZoom = clampZoom(state.zoom * getWheelZoomFactor(event.deltaY))
      const nextState = applyZoomAtPoint(state.zoom, state.panOffset, pointer, nextZoom)

      state.setZoom(nextState.zoom)
      state.setPan(nextState.panOffset.x, nextState.panOffset.y)
    }

    viewportElement.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      viewportElement.removeEventListener("wheel", handleWheel)
    }
  }, [viewportRef])

  return (
    <>
      <div ref={viewportRef} className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)` }}>
          <div
            className="absolute inset-0"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          >
            <canvas
              data-editor-canvas="true"
              ref={canvasRef}
              className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
            />
            {immersiveCanvas ? (
              <>
                <div
                  aria-hidden="true"
                  className="absolute top-0 left-0 z-30 h-full w-8"
                  onPointerEnter={exitImmersiveCanvas}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-0 right-0 z-30 h-full w-8"
                  onPointerEnter={exitImmersiveCanvas}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {!isReady ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div
            aria-hidden="true"
            className="relative h-px w-[min(180px,28vw)] overflow-hidden bg-white/12"
          >
            <div className="absolute inset-y-0 left-0 w-[38%] animate-[loader-sweep_1.15s_cubic-bezier(0.22,1,0.36,1)_infinite] bg-white/72 shadow-[0_0_18px_rgba(255,255,255,0.18)]" />
          </div>
        </div>
      ) : null}
    </>
  )
}
