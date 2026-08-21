"use client"

import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useMobileCanvasFit } from "@/components/editor/use-mobile-canvas-fit"
import { useEditorRenderer } from "@/hooks/use-editor-renderer"
import { isEditableTarget } from "@/lib/editor/is-editable-target"
import { inferFileAssetKind } from "@/lib/editor/media-file"
import {
  isPreviewExporting,
  subscribeToPreviewRenderLock,
} from "@/lib/editor/preview-render-lock"
import {
  applyZoomAtPoint,
  clampZoom,
  getWheelZoomFactor,
} from "@/lib/editor/view-transform"
import { getCompositionFrame } from "@/lib/editor/composition"
import { getRequestedSceneSlug } from "@/lib/editor/requested-scene-slug"
import { getSeedableMediaDuration } from "@/lib/editor/timeline-duration"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

const PENDING_SCENE_TIMEOUT_MS = 20_000

export function EditorCanvasViewport() {
  const { canvasRef, isReady, viewportRef } = useEditorRenderer()

  useMobileCanvasFit(viewportRef)
  const exportingPreview = useSyncExternalStore(
    subscribeToPreviewRenderLock,
    isPreviewExporting,
    () => false
  )
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const exitImmersiveCanvas = useEditorStore(
    (state) => state.exitImmersiveCanvas
  )
  const panOffset = useEditorStore((state) => state.panOffset)
  const pendingSceneSlug = useEditorStore((state) => state.pendingSceneSlug)
  const setPendingScene = useEditorStore((state) => state.setPendingScene)
  const zoom = useEditorStore((state) => state.zoom)
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const canvasSize = useEditorStore((state) => state.canvasSize)

  useEffect(() => {
    const requested = getRequestedSceneSlug()

    if (!requested) {
      return
    }

    setPendingScene(requested)

    const failsafe = window.setTimeout(() => {
      useEditorStore.getState().clearPendingScene()
    }, PENDING_SCENE_TIMEOUT_MS)

    return () => window.clearTimeout(failsafe)
  }, [setPendingScene])

  const compositionOverlay = useMemo(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return null

    const frame = getCompositionFrame(sceneConfig, canvasSize)

    if (
      frame.x === 0 &&
      frame.y === 0 &&
      frame.width === canvasSize.width &&
      frame.height === canvasSize.height
    ) {
      return null
    }

    return {
      heightPercent: (frame.height / canvasSize.height) * 100,
      widthPercent: (frame.width / canvasSize.width) * 100,
    }
  }, [canvasSize, sceneConfig])

  const [isDragOver, setIsDragOver] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPointerPanning, setIsPointerPanning] = useState(false)
  const addLayer = useLayerStore((state) => state.addLayer)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const seedDurationFromMedia = useTimelineStore(
    (state) => state.seedDurationFromMedia
  )
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const pointerPanRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  const stopPointerPan = useCallback(() => {
    pointerPanRef.current = null
    setIsPointerPanning(false)
  }, [])

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (
      event.currentTarget instanceof HTMLElement &&
      !event.currentTarget.contains(event.relatedTarget as Node)
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault()
      setIsDragOver(false)

      const files = Array.from(event.dataTransfer.files)

      for (const file of files) {
        const kind = inferFileAssetKind(file)
        if (kind === "image" || kind === "video") {
          try {
            const asset = await loadAsset(file)
            const layerId = addLayer(kind)
            setLayerAsset(layerId, asset.id)
            seedDurationFromMedia(getSeedableMediaDuration(asset))
          } catch {
            return
          }
        }
      }
    },
    [addLayer, loadAsset, seedDurationFromMedia, setLayerAsset]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " && !isEditableTarget(event.target)) {
        setIsSpacePressed(true)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setIsSpacePressed(false)
      }
    }

    const handleWindowBlur = () => {
      setIsSpacePressed(false)
      stopPointerPan()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleWindowBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [stopPointerPan])

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

      event.preventDefault()

      const state = useEditorStore.getState()

      if (shouldZoom) {
        event.stopPropagation()

        const rect = viewportElement.getBoundingClientRect()
        const pointer = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        }
        const nextZoom = clampZoom(state.zoom * getWheelZoomFactor(event.deltaY))
        const nextState = applyZoomAtPoint(
          state.zoom,
          state.panOffset,
          pointer,
          nextZoom
        )

        state.setZoom(nextState.zoom)
        state.setPan(nextState.panOffset.x, nextState.panOffset.y)
        return
      }

      state.setPan(
        state.panOffset.x - event.deltaX,
        state.panOffset.y - event.deltaY
      )
    }

    viewportElement.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      viewportElement.removeEventListener("wheel", handleWheel)
    }
  }, [viewportRef])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !isSpacePressed) {
        return
      }

      event.preventDefault()

      const state = useEditorStore.getState()
      pointerPanRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startPanX: state.panOffset.x,
        startPanY: state.panOffset.y,
      }
      setIsPointerPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [isSpacePressed]
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activePan = pointerPanRef.current

      if (!activePan || activePan.pointerId !== event.pointerId) {
        return
      }

      useEditorStore.getState().setPan(
        activePan.startPanX + (event.clientX - activePan.originX),
        activePan.startPanY + (event.clientY - activePan.originY)
      )
    },
    []
  )

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activePan = pointerPanRef.current

      if (!activePan || activePan.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      stopPointerPan()
    },
    [stopPointerPan]
  )

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const activePan = pointerPanRef.current

      if (!activePan || activePan.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      stopPointerPan()
    },
    [stopPointerPan]
  )

  let viewportCursor: "grab" | "grabbing" | undefined

  if (isPointerPanning) {
    viewportCursor = "grabbing"
  } else if (isSpacePressed) {
    viewportCursor = "grab"
  }

  return (
    <>
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        role="application"
        aria-label="Canvas viewport"
        style={{
          cursor: viewportCursor,
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            <canvas
              data-editor-canvas="true"
              ref={canvasRef}
              className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
            />
            {compositionOverlay && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border border-white/20"
                style={{
                  width: `${compositionOverlay.widthPercent}%`,
                  height: `${compositionOverlay.heightPercent}%`,
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                }}
              />
            )}
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

        {isDragOver ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-white/30 bg-black/30 backdrop-blur-[2px]">
            <span className="font-[var(--ds-font-sans)] text-xs text-white/70">
              Drop to add layer
            </span>
          </div>
        ) : null}
      </div>

      {isReady && !pendingSceneSlug ? null : (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--ds-color-surface-canvas,#050507)] p-6">
          <div
            aria-hidden="true"
            className="relative h-[3px] w-[min(220px,32vw)] overflow-hidden rounded-full bg-white/12"
          >
            <div className="absolute inset-y-0 left-0 w-[38%] animate-[loader-bounce_0.9s_cubic-bezier(0.65,0,0.35,1)_infinite_alternate] rounded-full bg-white/72 shadow-[0_0_18px_rgba(255,255,255,0.18)]" />
          </div>
        </div>
      )}

      {exportingPreview ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.88)] px-3 py-1.5 backdrop-blur-[28px]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[rgb(182_151_255)]"
            />
            <span className="font-[var(--ds-font-mono)] text-[11px] leading-4 text-[var(--ds-color-text-secondary)]">
              Exporting — keep this tab open
            </span>
          </div>
        </div>
      ) : null}
    </>
  )
}
