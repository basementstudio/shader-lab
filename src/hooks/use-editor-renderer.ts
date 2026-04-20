"use client"

import { useEffect, useRef, useState } from "react"
import { buildRendererFrame, type EditorRenderer } from "@/renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "@/renderer/create-webgpu-renderer"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import {
  getActivePresetSettings,
  useGraphicsPresetStore,
} from "@/store/graphics-preset-store"
import { useLayerStore } from "@/store/layer-store"
import { useMetricsStore } from "@/store/metrics-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { Size } from "@/types/editor"

function getPixelRatio(): number {
  if (typeof window === "undefined") {
    return 1
  }

  const preset = getActivePresetSettings()
  const base = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap)
  return Math.max(0.25, base * preset.renderScale)
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
        "This browser does not expose WebGPU yet."
      )
      setFallbackMessage("WebGPU is not available in this browser.")
      return
    }

    let isDisposed = false
    let lastFrameTime = performance.now()
    let previewTime = 0
    let resizeObserver: ResizeObserver | null = null
    let unsubscribePreset: (() => void) | null = null

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
        editorStore.setLiveRenderer(renderer)

        if (isDisposed) {
          editorStore.setLiveRenderer(null)
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

          useEditorStore
            .getState()
            .setCanvasSize(nextSize.width, nextSize.height)
          renderer.resize(nextSize, getPixelRatio())
        })

        resizeObserver.observe(viewportElement)

        unsubscribePreset = useGraphicsPresetStore.subscribe((state, prev) => {
          if (state.mode === prev.mode && state.detected === prev.detected) {
            return
          }
          const size = useEditorStore.getState().canvasSize
          renderer.resize(size, getPixelRatio())
        })

        const renderFrame = async (now: number) => {
          const layerState = useLayerStore.getState()
          const assetState = useAssetStore.getState()
          const editorState = useEditorStore.getState()
          const rawDelta = Math.max(0, (now - lastFrameTime) / 1000)

          lastFrameTime = now

          let timelineState = useTimelineStore.getState()
          const frozen = timelineState.frozen
          const delta = frozen ? 0 : rawDelta

          if (!frozen) {
            previewTime += rawDelta
          }

          if (timelineState.isPlaying && !frozen) {
            timelineState.advance(delta)
            timelineState = useTimelineStore.getState()
          }

          if (rawDelta > 0) {
            useMetricsStore.getState().setFps(1 / rawDelta)
          }

          const clockTime = previewTime
          useTimelineStore.getState().setLastRenderedClockTime(clockTime)
          renderer.setPreviewFrozen(true)

          const frame = buildRendererFrame({
            assets: assetState.assets,
            clockTime,
            delta,
            layers: layerState.layers,
            outputSize: editorState.outputSize,
            pixelRatio: getPixelRatio(),
            sceneConfig: editorState.sceneConfig,
            timeline: timelineState,
            viewportSize: editorState.canvasSize,
          })

          await renderer.prepareForExportFrame(
            timelineState.currentTime,
            timelineState.loop
          )

          if (isDisposed) {
            return
          }

          renderer.render(frame)
          animationFrameRef.current = window.requestAnimationFrame(
            (nextNow) => {
              void renderFrame(nextNow)
            }
          )
        }

        animationFrameRef.current = window.requestAnimationFrame((nextNow) => {
          void renderFrame(nextNow)
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Renderer initialization failed."

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

      unsubscribePreset?.()

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }

      useEditorStore.getState().setLiveRenderer(null)
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
