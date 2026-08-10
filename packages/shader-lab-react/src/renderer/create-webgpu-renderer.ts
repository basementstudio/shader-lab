import * as THREE from "three/webgpu"
import type { RendererFrame, RuntimeRenderer } from "./contracts"
import { PipelineManager } from "./pipeline-manager"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  onRuntimeError?: (message: string | null) => void
): Promise<RuntimeRenderer> {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: false,
    canvas,
  })
  let pipeline: PipelineManager | null = null
  let currentPixelRatio = 1

  function toDeviceSize(size: { height: number; width: number }) {
    return {
      height: Math.max(1, Math.round(size.height * currentPixelRatio)),
      width: Math.max(1, Math.round(size.width * currentPixelRatio)),
    }
  }

  return {
    async initialize() {
      await renderer.init()
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).outputColorSpace = THREE.SRGBColorSpace
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).toneMapping = THREE.NoToneMapping
      renderer.setClearColor("#0a0d10", 1)
    },

    resize(size, pixelRatio) {
      currentPixelRatio = pixelRatio
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
      pipeline?.resize(toDeviceSize(size))
    },

    render(frame: RendererFrame) {
      if (!pipeline) {
        pipeline = new PipelineManager(
          renderer,
          toDeviceSize(frame.viewportSize),
          onRuntimeError
        )
      }

      pipeline.updateLogicalSize(frame.logicalSize)
      pipeline.syncLayers([...frame.layers].reverse())
      return pipeline.render(frame.clock.time, frame.clock.delta)
    },

    dispose() {
      renderer.setAnimationLoop(null)
      pipeline?.dispose()
      renderer.dispose()
    },
  }
}
