"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useRef, useState } from "react"
import { registerAgentFramePump } from "@/lib/agent-bridge/frame-pump"
import { isPreviewRenderLocked } from "@/lib/editor/preview-render-lock"
import {
  armRendererBootDeadline,
  bootMarks,
  captureRendererBootRecovery,
  captureRendererBootTimeout,
  markBootStage,
  settleRendererBootDeadline,
  startRendererBootTrace,
  stopRendererBootTrace,
} from "@/lib/renderer-boot"
import { gpuSnapshot } from "@/lib/webgpu-diagnostics"
import { buildRendererFrame, type EditorRenderer } from "@/renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "@/renderer/create-webgpu-renderer"
import { errorFingerprint } from "@/renderer/pass-failure"
import { useAssetStore } from "@/store/asset-store"
import { selectAudioModulationInput, useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useMetricsStore } from "@/store/metrics-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { Size } from "@/types/editor"

function getPixelRatio(): number {
  if (typeof window === "undefined") {
    return 1
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const renderScale = useEditorStore.getState().renderScale

  return Math.max(0.1, devicePixelRatio * renderScale)
}

function measureElement(element: HTMLElement): Size {
  const bounds = element.getBoundingClientRect()

  return {
    height: Math.max(1, Math.round(bounds.height)),
    width: Math.max(1, Math.round(bounds.width)),
  }
}

// Generous: this only waits on adapter and device acquisition.
const BOOT_TIMEOUT_MS = 20_000

// A persistent GPU fault throws every frame; halt instead of spinning.
const MAX_CONSECUTIVE_FRAME_FAILURES = 5

function sceneInfo() {
  const editor = useEditorStore.getState()

  return {
    layerCount: useLayerStore.getState().layers.length,
    outputSize: `${editor.outputSize.width}x${editor.outputSize.height}`,
    renderScale: editor.renderScale,
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
      // Not a Sentry event: an unsupported browser is analytics, not an error.
      // The context rides along on any real error instead.
      Sentry.setContext("gpu", gpuSnapshot())
      return
    }

    let isDisposed = false
    let lastFrameTime = performance.now()
    let previewTime = 0
    let resizeObserver: ResizeObserver | null = null
    let frameInFlight = false
    let unregisterFramePump: (() => void) | null = null
    let unsubscribeRenderScale: (() => void) | null = null
    let consecutiveFrameFailures = 0
    let loopHalted = false
    let firstFrameMarked = false
    const reportedFrameErrors = new Set<string>()

    editorStore.setWebGPUStatus("initializing")
    startRendererBootTrace()
    markBootStage("webgpu-probed")
    armRendererBootDeadline(BOOT_TIMEOUT_MS, () => {
      captureRendererBootTimeout(BOOT_TIMEOUT_MS, sceneInfo())
    })

    async function initializeRenderer() {
      try {
        const renderer = await createWebGPURenderer(canvasElement)
        markBootStage("renderer-created")

        if (isDisposed) {
          renderer.dispose()
          return
        }

        rendererRef.current = renderer
        await renderer.initialize()
        markBootStage("device-ready")
        Sentry.setContext("gpu", gpuSnapshot())
        editorStore.setLiveRenderer(renderer)
        editorStore.setLiveCanvas(canvasElement)

        if (isDisposed) {
          editorStore.setLiveRenderer(null)
          editorStore.setLiveCanvas(null)
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

        let lastRenderScale = useEditorStore.getState().renderScale
        unsubscribeRenderScale = useEditorStore.subscribe((state) => {
          if (state.renderScale === lastRenderScale) {
            return
          }

          lastRenderScale = state.renderScale
          renderer.resize(useEditorStore.getState().canvasSize, getPixelRatio())
        })

        const scheduleNextFrame = () => {
          if (isDisposed || loopHalted) {
            return
          }

          animationFrameRef.current = window.requestAnimationFrame(
            (nextNow) => {
              void renderFrame(nextNow)
            }
          )
        }

        const haltLoop = (message: string, deviceLost: boolean) => {
          if (loopHalted) {
            return
          }

          loopHalted = true
          // Terminal before the first frame: otherwise the boot deadline still
          // fires a misleading timeout 20s later.
          settleRendererBootDeadline()
          useEditorStore.getState().setWebGPUStatus("error", message)
          setFallbackMessage(message)

          Sentry.captureMessage("Render loop halted", {
            extra: { consecutiveFrameFailures, ...sceneInfo() },
            level: "error",
            tags: {
              "halt.device_lost": String(deviceLost),
              surface: "render-loop-halted",
            },
          })
        }

        const handleFrameFailure = (error: unknown) => {
          consecutiveFrameFailures += 1

          // By fingerprint, not a flag: a different failure is new information.
          const fingerprint = errorFingerprint(error)

          if (!reportedFrameErrors.has(fingerprint)) {
            reportedFrameErrors.add(fingerprint)
            Sentry.captureException(error, {
              contexts: { renderer_boot: { marks: bootMarks() } },
              extra: sceneInfo(),
              tags: { surface: "render-frame" },
            })
          }

          const deviceLost = renderer.isDeviceLost()

          if (deviceLost) {
            haltLoop(
              "The GPU device was lost. Reload the page to restart the renderer.",
              true
            )
            return
          }

          if (consecutiveFrameFailures >= MAX_CONSECUTIVE_FRAME_FAILURES) {
            haltLoop(
              "The renderer stopped after repeated errors. Reload the page to try again.",
              false
            )
          }
        }

        const renderFrame = async (now: number) => {
          frameInFlight = true

          try {
            await runFrame(now)

            if (consecutiveFrameFailures > 0) {
              // Recovered: forget fingerprints so a recurrence reports again.
              consecutiveFrameFailures = 0
              reportedFrameErrors.clear()
            }
          } catch (error) {
            handleFrameFailure(error)
          } finally {
            // Must be finally: a throw would wedge the agent frame pump.
            frameInFlight = false
          }

          scheduleNextFrame()
        }

        const runFrame = async (now: number) => {
          // three's render() returns silently once the device is lost, so this
          // never surfaces as a throw — poll the renderer instead.
          if (renderer.isDeviceLost()) {
            haltLoop(
              "The GPU device was lost. Reload the page to restart the renderer.",
              true
            )
            return
          }

          if (isPreviewRenderLocked()) {
            lastFrameTime = now
            useMetricsStore.getState().setFps(0)
            return
          }

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
            audio: selectAudioModulationInput(useAudioStore.getState()),
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

          if (!firstFrameMarked) {
            firstFrameMarked = true
            markBootStage("first-frame")
            settleRendererBootDeadline()
            captureRendererBootRecovery()
          }
        }

        animationFrameRef.current = window.requestAnimationFrame((nextNow) => {
          void renderFrame(nextNow)
        })

        unregisterFramePump = registerAgentFramePump(() => {
          if (isDisposed || frameInFlight || loopHalted) {
            return
          }

          if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current)
            animationFrameRef.current = null
          }

          void renderFrame(performance.now())
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Renderer initialization failed."

        useEditorStore.getState().setWebGPUStatus("error", message)
        setFallbackMessage(message)
        // Terminal: without this the 20s deadline still fires a second, bogus
        // "boot timed out" on top of the real failure.
        settleRendererBootDeadline()
        Sentry.captureException(error, {
          contexts: { renderer_boot: { marks: bootMarks() } },
          tags: { surface: "webgpu-init" },
        })
      }
    }

    void initializeRenderer()

    return () => {
      isDisposed = true

      stopRendererBootTrace()
      unregisterFramePump?.()
      unsubscribeRenderScale?.()

      if (resizeObserver) {
        resizeObserver.disconnect()
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }

      useEditorStore.getState().setLiveRenderer(null)
      useEditorStore.getState().setLiveCanvas(null)
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
