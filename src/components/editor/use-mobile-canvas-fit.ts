"use client"

import { type RefObject, useEffect } from "react"
import {
  computeFitZoom,
  MOBILE_CANVAS_BOTTOM_INSET,
  MOBILE_VIEWPORT_MAX_WIDTH,
} from "@/lib/editor/view-transform"
import { useEditorStore } from "@/store/editor-store"

let registeredViewport: HTMLElement | null = null

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  return window.innerWidth < MOBILE_VIEWPORT_MAX_WIDTH
}

export function fitMobileCanvas(): void {
  if (!registeredViewport) {
    return
  }

  const { canvasSize, immersiveCanvas, setPan, setZoom } =
    useEditorStore.getState()
  const rect = registeredViewport.getBoundingClientRect()
  const insetBottom = immersiveCanvas ? 0 : MOBILE_CANVAS_BOTTOM_INSET
  const zoom = computeFitZoom({
    compositionHeight: canvasSize.height,
    compositionWidth: canvasSize.width,
    insetBottom,
    viewportHeight: rect.height,
    viewportWidth: rect.width,
  })

  if (zoom === null) {
    return
  }

  setPan(0, -insetBottom / 2)
  setZoom(zoom)
}

export function useMobileCanvasFit(
  viewportRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    registeredViewport = viewportRef.current

    if (!isMobileViewport()) {
      return () => {
        registeredViewport = null
      }
    }

    const onResize = () => {
      if (isMobileViewport()) {
        fitMobileCanvas()
      }
    }

    const frame = window.requestAnimationFrame(fitMobileCanvas)
    const unsubscribeCanvasSize = useEditorStore.subscribe(
      (state, previousState) => {
        if (state.canvasSize !== previousState.canvasSize) {
          onResize()
        }
      }
    )

    window.visualViewport?.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)

    return () => {
      window.cancelAnimationFrame(frame)
      unsubscribeCanvasSize()
      window.visualViewport?.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
      registeredViewport = null
    }
  }, [viewportRef])
}
