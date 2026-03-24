import * as THREE from "three/webgpu"
import { PipelineManager } from "@/renderer/pipeline-manager"
import type { EditorRenderer, RendererFrame } from "@/renderer/contracts"
import type { Size } from "@/types/editor"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<EditorRenderer> {
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

    resize(size: Size, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
      pipeline?.resize(size)
    },

    render(frame: RendererFrame) {
      if (!pipeline) {
        pipeline = new PipelineManager(renderer, frame.viewportSize)
      }

      pipeline.updateLogicalSize(frame.logicalSize)
      pipeline.syncLayers([...frame.layers].reverse())
      pipeline.render(frame.clock.time, frame.clock.delta)
    },

    dispose() {
      renderer.setAnimationLoop(null)
      pipeline?.dispose()
      renderer.dispose()
    },
  }
}
