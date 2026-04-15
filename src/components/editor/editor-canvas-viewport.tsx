"use client"

import {
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useEditorRenderer } from "@/hooks/use-editor-renderer"
import { inferFileAssetKind } from "@/lib/editor/media-file"
import {
  applyZoomAtPoint,
  clampZoom,
  getWheelZoomFactor,
} from "@/lib/editor/view-transform"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import type { CompositionAspect } from "@/types/editor"

function getCompositionAspectRatio(
  aspect: CompositionAspect,
  customWidth: number,
  customHeight: number
): number | null {
  switch (aspect) {
    case "screen":
      return null
    case "16:9":
      return 16 / 9
    case "9:16":
      return 9 / 16
    case "4:3":
      return 4 / 3
    case "3:4":
      return 3 / 4
    case "1:1":
      return 1
    case "custom":
      return customWidth / Math.max(customHeight, 1)
    default:
      return null
  }
}

export function EditorCanvasViewport() {
  const { canvasRef, isReady, viewportRef } = useEditorRenderer()
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const exitImmersiveCanvas = useEditorStore(
    (state) => state.exitImmersiveCanvas
  )
  const panOffset = useEditorStore((state) => state.panOffset)
  const zoom = useEditorStore((state) => state.zoom)
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const canvasSize = useEditorStore((state) => state.canvasSize)

  const compositionOverlay = useMemo(() => {
    const ratio = getCompositionAspectRatio(
      sceneConfig.compositionAspect,
      sceneConfig.compositionWidth,
      sceneConfig.compositionHeight
    )
    if (ratio === null) return null
    if (canvasSize.width === 0 || canvasSize.height === 0) return null

    const viewportAspect = canvasSize.width / canvasSize.height

    let widthPercent: number
    let heightPercent: number

    if (ratio > viewportAspect) {
      widthPercent = 100
      heightPercent = (viewportAspect / ratio) * 100
    } else {
      heightPercent = 100
      widthPercent = (ratio / viewportAspect) * 100
    }

    return { widthPercent, heightPercent }
  }, [
    sceneConfig.compositionAspect,
    sceneConfig.compositionWidth,
    sceneConfig.compositionHeight,
    canvasSize,
  ])

  const [isDragOver, setIsDragOver] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPointerPanning, setIsPointerPanning] = useState(false)
  const addLayer = useLayerStore((state) => state.addLayer)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
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
          } catch {
            // No-op.
          }
        }
      }
    },
    [addLayer, loadAsset, setLayerAsset]
  )

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement)

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
            <span className="font-[var(--ds-font-mono)] text-xs text-white/70">
              Drop to add layer
            </span>
          </div>
        ) : null}
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
