"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useRef, useState } from "react"
import { registerAgentFramePump } from "@/lib/agent-bridge/frame-pump"
import { isPreviewRenderLocked } from "@/lib/editor/preview-render-lock"
import { RendererBootTrace } from "@/lib/renderer-boot"
import { gpuSnapshot } from "@/lib/webgpu-diagnostics"
import { buildRendererFrame, type EditorRenderer } from "@/renderer/contracts"
import { errorFingerprint } from "@/renderer/pass-failure"
import { browserSupportsWebGPU } from "@/renderer/webgpu-support"
import { useAssetStore } from "@/store/asset-store"
import { selectAudioModulationInput, useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useMetricsStore } from "@/store/metrics-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { Size } from "@/types/editor"

/* three/webgpu and the pass graph live in their own chunk. Kick the fetch
 * off at module-evaluation time so it downloads while React is still
 * hydrating, instead of waiting for the mount effect. */
const rendererModulePromise = browserSupportsWebGPU()
  ? import("@/renderer/create-webgpu-renderer")
  : null

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

// Cap on holding the overlay: a wedged resource must not trap the editor.
const SCENE_REVEAL_TIMEOUT_MS = 8_000

// A persistent GPU fault throws every frame; halt instead of spinning.
const MAX_CONSECUTIVE_FRAME_FAILURES = 5

const HALT_MESSAGE = {
  "device-lost":
    "The GPU device was lost. Reload the page to restart the renderer.",
  "repeated-errors":
    "The renderer stopped after repeated errors. Reload the page to try again.",
} as const

type HaltReason = keyof typeof HALT_MESSAGE

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
    let unsubscribeSceneRevision: (() => void) | null = null
    let consecutiveFrameFailures = 0
    let loopHalted = false
    let firstFrameMarked = false
    let sceneRevealed = false
    let revealDeadline = Number.POSITIVE_INFINITY
    const reportedFrameErrors = new Set<string>()

    editorStore.setWebGPUStatus("initializing")
    const boot = new RendererBootTrace()
    boot.start()
    boot.mark("webgpu-probed")
    boot.armDeadline(BOOT_TIMEOUT_MS, () => {
      boot.captureTimeout(sceneInfo())
    })

    async function initializeRenderer() {
      try {
        if (!rendererModulePromise) {
          throw new Error("WebGPU is not available in this browser.")
        }

        const { createWebGPURenderer } = await rendererModulePromise
        const renderer = await createWebGPURenderer(canvasElement)
        boot.mark("renderer-created")

        if (isDisposed) {
          renderer.dispose()
          return
        }

        rendererRef.current = renderer
        await renderer.initialize()
        boot.mark("device-ready")
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
        revealDeadline = performance.now() + SCENE_REVEAL_TIMEOUT_MS

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

        // A swapped-in scene gets its own loading state: without this the
        // overlay lifts on the starter scene and the replacement's layers
        // appear one compile at a time.
        let lastSceneRevision = useEditorStore.getState().sceneRevision
        let renderedSceneRevision = lastSceneRevision
        unsubscribeSceneRevision = useEditorStore.subscribe((state) => {
          if (state.sceneRevision === lastSceneRevision) {
            return
          }

          lastSceneRevision = state.sceneRevision
          sceneRevealed = false
          revealDeadline = performance.now() + SCENE_REVEAL_TIMEOUT_MS
          setIsReady(false)
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

        const revealScene = () => {
          if (sceneRevealed) {
            return
          }

          sceneRevealed = true
          setIsReady(true)
        }

        const haltLoop = (reason: HaltReason) => {
          if (loopHalted) {
            return
          }

          loopHalted = true
          revealScene()
          // Terminal before the first frame: otherwise the boot deadline still
          // fires a misleading timeout 20s later.
          boot.settleDeadline()

          const message = HALT_MESSAGE[reason]
          useEditorStore.getState().setWebGPUStatus("error", message)
          setFallbackMessage(message)

          Sentry.captureMessage("Render loop halted", {
            extra: { consecutiveFrameFailures, ...sceneInfo() },
            level: "error",
            tags: { "halt.reason": reason, surface: "render-loop-halted" },
          })
        }

        const handleFrameFailure = (error: unknown) => {
          consecutiveFrameFailures += 1

          // By fingerprint, not a flag: a different failure is new information.
          const fingerprint = errorFingerprint(error)

          if (!reportedFrameErrors.has(fingerprint)) {
            reportedFrameErrors.add(fingerprint)
            // The boot breadcrumbs already carry the stage timings.
            Sentry.captureException(error, {
              extra: sceneInfo(),
              tags: { surface: "render-frame" },
            })
          }

          if (renderer.isDeviceLost()) {
            haltLoop("device-lost")
            return
          }

          if (consecutiveFrameFailures >= MAX_CONSECUTIVE_FRAME_FAILURES) {
            haltLoop("repeated-errors")
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

          // Out here, not in runFrame: that body has early exits. The
          // revisions must agree: a swap can land mid-frame, and that frame
          // still carries the outgoing scene.
          if (
            (firstFrameMarked &&
              renderedSceneRevision === lastSceneRevision &&
              !renderer.hasPendingResources()) ||
            performance.now() >= revealDeadline
          ) {
            revealScene()
          }

          scheduleNextFrame()
        }

        const runFrame = async (now: number) => {
          // three's render() returns silently once the device is lost, so this
          // never surfaces as a throw — poll the renderer instead.
          if (renderer.isDeviceLost()) {
            haltLoop("device-lost")
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
          renderedSceneRevision = editorState.sceneRevision
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
            boot.mark("first-frame")
            boot.settleDeadline()
            boot.captureRecovery()
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
        boot.settleDeadline()
        Sentry.captureException(error, { tags: { surface: "webgpu-init" } })
      }
    }

    void initializeRenderer()

    return () => {
      isDisposed = true

      boot.dispose()
      unregisterFramePump?.()
      unsubscribeRenderScale?.()
      unsubscribeSceneRevision?.()

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
