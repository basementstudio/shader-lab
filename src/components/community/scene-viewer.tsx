"use client"

import { PlayIcon } from "@radix-ui/react-icons"
import { useCallback, useEffect, useRef, useState } from "react"
import { Typography } from "@/components/ui/typography"
import {
  buildViewerProjectState,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import { cn } from "@/lib/cn"
import { buildRendererFrame } from "@/renderer/contracts"
import { advanceProjectTimeline } from "@/renderer/project-clock"
import { browserSupportsWebGPU } from "@/renderer/webgpu-support"
import type { Size } from "@/types/editor"

const MAX_CONSECUTIVE_FRAME_FAILURES = 5

// Cap on hiding the canvas behind the poster: a wedged resource must not
// keep the live view from ever appearing.
const REVEAL_TIMEOUT_MS = 8_000

function measureElement(element: HTMLElement): Size {
  const bounds = element.getBoundingClientRect()

  return {
    height: Math.max(1, Math.round(bounds.height)),
    width: Math.max(1, Math.round(bounds.width)),
  }
}

/* Live, view-only playback of a published scene over the poster thumbnail.
 * Runs the editor renderer on a plain project snapshot — no editor stores,
 * no autosave, no interaction. On unsupported browsers or any failure the
 * poster simply stays. */
export function SceneViewer({
  hasCameraLayer,
  hasCustomShader,
  labUrl,
}: {
  hasCameraLayer: boolean
  hasCustomShader: boolean
  labUrl: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const startedRef = useRef(false)
  const disposeRef = useRef<(() => void) | null>(null)
  const [supported, setSupported] = useState(false)
  const [activated, setActivated] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [failed, setFailed] = useState(false)

  // Scenes that run untrusted shader code or ask for the camera never
  // start on their own — the visitor opts in.
  const requiresActivation = hasCameraLayer || hasCustomShader

  const start = useCallback(() => {
    if (startedRef.current) {
      return
    }

    startedRef.current = true

    const run = async () => {
      const canvas = canvasRef.current
      const container = containerRef.current

      if (!(canvas && container)) {
        return
      }

      let disposed = false
      let animationFrame: number | null = null
      let resizeObserver: ResizeObserver | null = null

      disposeRef.current = () => {
        disposed = true

        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame)
        }

        resizeObserver?.disconnect()
      }

      try {
        const [{ createWebGPURenderer }, labText] = await Promise.all([
          import("@/renderer/create-webgpu-renderer"),
          fetch(labUrl).then((res) => {
            if (!res.ok) {
              throw new Error("Could not load the scene file.")
            }

            return res.text()
          }),
        ])

        const project = buildViewerProjectState(parseLabProjectFile(labText))
        const renderer = await createWebGPURenderer(canvas)

        disposeRef.current = () => {
          disposed = true

          if (animationFrame !== null) {
            window.cancelAnimationFrame(animationFrame)
          }

          resizeObserver?.disconnect()
          renderer.dispose()
        }

        await renderer.initialize()

        if (disposed) {
          renderer.dispose()
          return
        }

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        let viewportSize = measureElement(container)
        renderer.resize(viewportSize, pixelRatio)

        resizeObserver = new ResizeObserver(([entry]) => {
          if (!entry) {
            return
          }

          viewportSize = {
            height: Math.max(1, Math.round(entry.contentRect.height)),
            width: Math.max(1, Math.round(entry.contentRect.width)),
          }
          renderer.resize(viewportSize, pixelRatio)
        })

        resizeObserver.observe(container)

        let timeline = project.timeline
        let clockTime = 0
        let lastFrameTime = performance.now()
        let consecutiveFailures = 0
        let firstFrameRendered = false
        let sceneRevealed = false
        const revealDeadline = performance.now() + REVEAL_TIMEOUT_MS

        const renderFrame = async (now: number) => {
          if (disposed) {
            return
          }

          try {
            const delta = Math.max(0, (now - lastFrameTime) / 1000)
            lastFrameTime = now
            clockTime += delta
            timeline = { ...timeline, ...advanceProjectTimeline(timeline, delta) }

            renderer.setPreviewFrozen(true)

            const frame = buildRendererFrame({
              assets: project.assets,
              audio: null,
              clockTime,
              delta,
              layers: project.layers,
              outputSize: project.composition,
              pixelRatio,
              sceneConfig: project.sceneConfig,
              timeline,
              viewportSize,
            })

            await renderer.prepareForExportFrame(
              timeline.currentTime,
              timeline.loop
            )

            if (disposed) {
              return
            }

            renderer.render(frame)
            consecutiveFailures = 0
            firstFrameRendered = true
          } catch {
            consecutiveFailures += 1

            if (
              renderer.isDeviceLost() ||
              consecutiveFailures >= MAX_CONSECUTIVE_FRAME_FAILURES
            ) {
              setFailed(true)
              return
            }
          }

          if (
            !sceneRevealed &&
            ((firstFrameRendered && !renderer.hasPendingResources()) ||
              performance.now() >= revealDeadline)
          ) {
            sceneRevealed = true
            setRevealed(true)
          }

          animationFrame = window.requestAnimationFrame((nextNow) => {
            void renderFrame(nextNow)
          })
        }

        animationFrame = window.requestAnimationFrame((nextNow) => {
          void renderFrame(nextNow)
        })
      } catch {
        setFailed(true)
      }
    }

    void run()
  }, [labUrl])

  useEffect(() => {
    if (!browserSupportsWebGPU()) {
      return
    }

    setSupported(true)

    if (!requiresActivation) {
      start()
    }

    return () => {
      disposeRef.current?.()
    }
  }, [requiresActivation, start])

  if (failed) {
    return null
  }

  return (
    <div className="absolute inset-0" ref={containerRef}>
      <canvas
        aria-hidden={!revealed}
        className={cn(
          "h-full w-full transition-opacity duration-300 ease-out",
          revealed ? "opacity-100" : "opacity-0"
        )}
        ref={canvasRef}
      />

      {supported && requiresActivation && !activated ? (
        <button
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-[var(--ds-space-3)] bg-[rgb(4_5_7_/_0.32)] transition-colors duration-160 hover:bg-[rgb(4_5_7_/_0.16)]"
          onClick={() => {
            setActivated(true)
            start()
          }}
          type="button"
        >
          <span className="inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-[rgb(8_9_12_/_0.68)] text-[var(--ds-color-text-primary)] backdrop-blur-[8px]">
            <PlayIcon height={20} width={20} />
          </span>
          <Typography
            as="span"
            className="rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-2 py-1 backdrop-blur-[8px]"
            tone="secondary"
            variant="monoXs"
          >
            {hasCameraLayer
              ? "Run scene — uses your camera"
              : "Run scene — includes custom shader code"}
          </Typography>
        </button>
      ) : null}
    </div>
  )
}
