import * as THREE from "three/webgpu"
import type { RendererFrame, RendererSize } from "./contracts"
import { PipelineManager } from "./pipeline-manager"

export interface HeadlessRenderer {
  dispose(): void
  initialize(): Promise<void>
  render(
    frame: RendererFrame,
    inputTexture?: THREE.Texture
  ): THREE.Texture | null
  resize(size: RendererSize, pixelRatio: number): void
}

export interface CreateHeadlessRendererOptions {
  onRuntimeError?: (message: string | null) => void
  renderer?: THREE.WebGPURenderer
  size: { height: number; width: number }
}

export function createHeadlessRenderer(
  options: CreateHeadlessRendererOptions
): HeadlessRenderer {
  const ownsRenderer = !options.renderer
  let renderer: THREE.WebGPURenderer | null = options.renderer ?? null
  let pipeline: PipelineManager | null = null
  let currentPixelRatio = 1

  function toPipelineSize(size: { height: number; width: number }) {
    if (!ownsRenderer) {
      return size
    }

    return {
      height: Math.max(1, Math.round(size.height * currentPixelRatio)),
      width: Math.max(1, Math.round(size.width * currentPixelRatio)),
    }
  }

  return {
    async initialize() {
      if (!renderer) {
        const canvas =
          typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(options.size.width, options.size.height)
            : document.createElement("canvas")

        renderer = new THREE.WebGPURenderer({
          alpha: false,
          antialias: false,
          canvas: canvas as HTMLCanvasElement,
        })
        await renderer.init()
      }
    },

    resize(newSize, pixelRatio) {
      currentPixelRatio = pixelRatio

      if (ownsRenderer && renderer) {
        renderer.setPixelRatio(pixelRatio)
        renderer.setSize(newSize.width, newSize.height, false)
      }
      pipeline?.resize(toPipelineSize(newSize))
    },

    render(
      frame: RendererFrame,
      inputTexture?: THREE.Texture
    ): THREE.Texture | null {
      if (!renderer) return null

      if (!pipeline) {
        pipeline = new PipelineManager(
          renderer,
          toPipelineSize(frame.viewportSize),
          options.onRuntimeError
        )
      }

      pipeline.updateLogicalSize(frame.logicalSize)
      pipeline.syncLayers([...frame.layers].reverse())

      if (ownsRenderer) {
        return pipeline.renderToTexture(
          frame.clock.time,
          frame.clock.delta,
          inputTexture
        )
      }

      const sharedRenderer = renderer as unknown as {
        getRenderTarget?: () => THREE.RenderTarget | null
        getScissor?: (target: THREE.Vector4) => THREE.Vector4
        getScissorTest?: () => boolean
        getViewport?: (target: THREE.Vector4) => THREE.Vector4
        setRenderTarget: (target: THREE.RenderTarget | null) => void
        setScissor?: (scissor: THREE.Vector4) => void
        setScissorTest?: (enabled: boolean) => void
        setViewport?: (viewport: THREE.Vector4) => void
      }
      const previousRenderTarget = sharedRenderer.getRenderTarget?.() ?? null
      const previousScissor = new THREE.Vector4()
      const previousViewport = new THREE.Vector4()
      const previousScissorTest = sharedRenderer.getScissorTest?.() ?? false
      sharedRenderer.getScissor?.(previousScissor)
      sharedRenderer.getViewport?.(previousViewport)

      try {
        return pipeline.renderToTexture(
          frame.clock.time,
          frame.clock.delta,
          inputTexture
        )
      } finally {
        sharedRenderer.setRenderTarget(previousRenderTarget)
        sharedRenderer.setScissor?.(previousScissor)
        sharedRenderer.setViewport?.(previousViewport)
        sharedRenderer.setScissorTest?.(previousScissorTest)
      }
    },

    dispose() {
      pipeline?.dispose()
      if (ownsRenderer && renderer) {
        renderer.setAnimationLoop(null)
        renderer.dispose()
      }
      renderer = null
      pipeline = null
    },
  }
}
