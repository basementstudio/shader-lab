"use client"

import { useEffect, useRef, useState } from "react"
import {
  buildRendererFrame,
  type EditorRenderer,
} from "@/renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "@/renderer/create-webgpu-renderer"
import type { Size } from "@/types/editor"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

function getPixelRatio(): number {
  if (typeof window === "undefined") {
    return 1
  }

  return Math.min(window.devicePixelRatio || 1, 2)
}

function measureElement(element: HTMLElement): Size {
  const bounds = element.getBoundingClientRect()

  return {
    height: Math.max(1, Math.round(bounds.height)),
    width: Math.max(1, Math.round(bounds.width)),
  }
}

export function useEditorRenderer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<EditorRenderer | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current

    if (!(canvas && viewport)) {
      return
    }

    const canvasElement = canvas
    const viewportElement = viewport

    const editorStore = useEditorStore.getState()

    if (!browserSupportsWebGPU()) {
      editorStore.setWebGPUStatus(
        "unsupported",
        "This browser does not expose WebGPU yet.",
      )
      setFallbackMessage("WebGPU is not available in this browser.")
      return
    }

    let isDisposed = false
    let lastFrameTime = performance.now()
    let previewTime = 0
    let resizeObserver: ResizeObserver | null = null

    editorStore.setWebGPUStatus("initializing")

    async function initializeRenderer() {
      try {
        const renderer = await createWebGPURenderer(canvasElement)

        if (isDisposed) {
          renderer.dispose()
          return
        }

        rendererRef.current = renderer
        await renderer.initialize()

        if (isDisposed) {
          renderer.dispose()
          return
        }

        const initialSize = measureElement(viewportElement)
        editorStore.setCanvasSize(initialSize.width, initialSize.height)
        renderer.resize(initialSize, getPixelRatio())
        editorStore.setWebGPUStatus("ready")
        setIsReady(true)

        resizeObserver = new ResizeObserver(([entry]) => {
          if (!entry) {
            return
          }

          const nextSize = {
            height: Math.max(1, Math.round(entry.contentRect.height)),
            width: Math.max(1, Math.round(entry.contentRect.width)),
          }

          useEditorStore.getState().setCanvasSize(nextSize.width, nextSize.height)
          renderer.resize(nextSize, getPixelRatio())
        })

        resizeObserver.observe(viewportElement)

        const renderFrame = (now: number) => {
          const layerState = useLayerStore.getState()
          const assetState = useAssetStore.getState()
          const editorState = useEditorStore.getState()
          const delta = Math.max(0, (now - lastFrameTime) / 1000)

          lastFrameTime = now
          previewTime += delta

          let timelineState = useTimelineStore.getState()

          if (timelineState.isPlaying) {
            timelineState.advance(delta)
            timelineState = useTimelineStore.getState()
          }

          if (delta > 0) {
            editorState.setFps(1 / delta)
          }

          const frame = buildRendererFrame({
            assets: assetState.assets,
            clockTime: timelineState.isPlaying ? timelineState.currentTime : previewTime,
            delta,
            layers: layerState.layers,
            outputSize: editorState.outputSize,
            pixelRatio: getPixelRatio(),
            startupPreviewDismissed: editorState.startupPreviewDismissed,
            timeline: timelineState,
            viewportSize: editorState.canvasSize,
          })

          renderer.render(frame)
          animationFrameRef.current = window.requestAnimationFrame(renderFrame)
        }

        animationFrameRef.current = window.requestAnimationFrame(renderFrame)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Renderer initialization failed."

        useEditorStore.getState().setWebGPUStatus("error", message)
        setFallbackMessage(message)
      }
    }

    void initializeRenderer()

    return () => {
      isDisposed = true

      if (resizeObserver) {
        resizeObserver.disconnect()
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }

      rendererRef.current?.dispose()
      rendererRef.current = null
      setIsReady(false)
    }
  }, [])

  return {
    canvasRef,
    fallbackMessage,
    isReady,
    viewportRef,
  }
}
