// @ts-nocheck
import * as THREE from "three/webgpu"
import { PipelineManager } from "./pipeline-manager"
import type { RendererFrame, RuntimeRenderer } from "./contracts"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
  onRuntimeError?: (message: string | null) => void,
): Promise<RuntimeRenderer> {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: true,
    canvas,
  })
  let pipeline: PipelineManager | null = null

  return {
    async initialize() {
      await renderer.init()
      renderer.setClearColor("#0a0d10", 1)
    },

    resize(size, pixelRatio) {
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
      pipeline?.resize(size)
    },

    render(frame: RendererFrame) {
      if (!pipeline) {
        pipeline = new PipelineManager(renderer, frame.viewportSize, onRuntimeError)
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
