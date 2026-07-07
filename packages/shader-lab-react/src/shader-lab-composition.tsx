import { type CSSProperties, useEffect, useRef, useState } from "react"
import { buildRendererFrame, type RendererSize } from "./renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "./renderer/create-webgpu-renderer"
import type { ShaderLabConfig } from "./types"

export interface ShaderLabCompositionProps {
  className?: string
  config: ShaderLabConfig
  /**
   * Called with a string message when a runtime error occurs (renderer
   * initialization failure, shader compilation error, missing WebGPU
   * support). After a non-null error has been reported, it is called once
   * with `null` when the error is resolved so error UIs can recover. It is
   * never called with `null` before an error has been reported, and it is
   * not called again for consecutive identical messages.
   */
  onRuntimeError?: (message: string | null) => void
  style?: CSSProperties
}

export function getShaderLabCompositionStyle(
  composition: ShaderLabConfig["composition"],
  style?: CSSProperties
): CSSProperties {
  return {
    ...(composition
      ? {
          aspectRatio: `${composition.width} / ${composition.height}`,
        }
      : {
          height: "100%",
        }),
    overflow: "hidden",
    position: "relative",
    width: "100%",
    ...style,
  }
}

export function ShaderLabComposition({
  className,
  config,
  onRuntimeError,
  style,
}: ShaderLabCompositionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const lastReportedErrorRef = useRef<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const handleRuntimeError = (message: string | null) => {
      setRuntimeError(message)

      if (message === lastReportedErrorRef.current) {
        return
      }

      lastReportedErrorRef.current = message
      onRuntimeError?.(message)
    }

    if (!browserSupportsWebGPU()) {
      handleRuntimeError("WebGPU is not available in this browser.")
      return
    }

    let cancelled = false
    let rendererPromise: Promise<
      Awaited<ReturnType<typeof createWebGPURenderer>>
    > | null = null
    let runtimeRenderer: Awaited<
      ReturnType<typeof createWebGPURenderer>
    > | null = null

    const getViewportSize = (): RendererSize => {
      const bounds = canvas.getBoundingClientRect()

      return {
        height: Math.max(1, Math.round(bounds.height)),
        width: Math.max(1, Math.round(bounds.width)),
      }
    }

    const renderFrame = (now: number) => {
      if (cancelled || !runtimeRenderer) {
        return
      }

      const previousTime = lastTimeRef.current ?? now
      const delta = Math.max(0, (now - previousTime) / 1000)
      lastTimeRef.current = now

      const devicePixelRatio = window.devicePixelRatio || 1
      const viewportSize = getViewportSize()
      const logicalSize = config.composition ?? viewportSize

      runtimeRenderer.resize(viewportSize, devicePixelRatio)
      runtimeRenderer.render(
        buildRendererFrame(
          config,
          now / 1000,
          delta,
          devicePixelRatio,
          viewportSize,
          { logicalSize }
        )
      )

      frameRef.current = window.requestAnimationFrame(renderFrame)
    }

    rendererPromise = createWebGPURenderer(canvas, handleRuntimeError)

    void rendererPromise
      .then(async (renderer) => {
        if (cancelled) {
          renderer.dispose()
          return
        }

        runtimeRenderer = renderer
        await renderer.initialize()
        handleRuntimeError(null)
        frameRef.current = window.requestAnimationFrame(renderFrame)
      })
      .catch((error) => {
        handleRuntimeError(
          error instanceof Error
            ? error.message
            : "Failed to initialize the Shader Lab runtime renderer."
        )
      })

    return () => {
      cancelled = true
      lastTimeRef.current = null

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }

      void rendererPromise?.then((renderer) => {
        renderer.dispose()
      })
    }
  }, [config, onRuntimeError])

  return (
    <div
      className={className}
      data-shader-lab-composition="true"
      style={getShaderLabCompositionStyle(config.composition, style)}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", height: "100%", width: "100%" }}
      />
      {runtimeError ? (
        <div
          style={{
            alignItems: "center",
            background: "rgba(10, 13, 16, 0.82)",
            color: "rgba(255,255,255,0.92)",
            display: "flex",
            fontFamily: "monospace",
            fontSize: 12,
            inset: 0,
            justifyContent: "center",
            padding: 16,
            position: "absolute",
            textAlign: "center",
          }}
        >
          {runtimeError}
        </div>
      ) : null}
    </div>
  )
}
