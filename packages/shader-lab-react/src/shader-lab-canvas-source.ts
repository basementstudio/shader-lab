import { buildRendererFrame, DEFAULT_RENDERER_SIZE } from "./renderer/contracts"
import {
  browserSupportsWebGPU,
  createWebGPURenderer,
} from "./renderer/create-webgpu-renderer"
import type { ShaderLabConfig } from "./types"

export interface ShaderLabCanvasSourceOptions {
  canvas?: HTMLCanvasElement
  height?: number
  pixelRatio?: number
  width?: number
}

export class ShaderLabCanvasSource {
  private readonly canvas: HTMLCanvasElement
  private rendererPromise: Promise<
    Awaited<ReturnType<typeof createWebGPURenderer>>
  > | null = null
  private runtimeRenderer: Awaited<
    ReturnType<typeof createWebGPURenderer>
  > | null = null
  private config: ShaderLabConfig
  private width: number
  private height: number
  private pixelRatio: number
  private disposed = false

  constructor(config: ShaderLabConfig, options?: ShaderLabCanvasSourceOptions) {
    this.config = config
    this.width =
      options?.width ?? config.composition?.width ?? DEFAULT_RENDERER_SIZE.width
    this.height =
      options?.height ??
      config.composition?.height ??
      DEFAULT_RENDERER_SIZE.height
    this.pixelRatio = options?.pixelRatio ?? 1
    this.canvas = options?.canvas ?? document.createElement("canvas")
  }

  async initialize(): Promise<void> {
    if (this.rendererPromise) {
      await this.rendererPromise
      return
    }

    if (!browserSupportsWebGPU()) {
      throw new Error("WebGPU is not available in this browser.")
    }

    this.rendererPromise = createWebGPURenderer(this.canvas)
    const renderer = await this.rendererPromise
    if (this.disposed) {
      renderer.dispose()
      return
    }

    this.runtimeRenderer = renderer
    await renderer.initialize()
    renderer.resize({ width: this.width, height: this.height }, this.pixelRatio)
  }

  update(time: number, delta: number): HTMLCanvasElement {
    if (!this.runtimeRenderer || this.disposed) {
      return this.canvas
    }

    const viewportSize = { width: this.width, height: this.height }
    this.runtimeRenderer.resize(viewportSize, this.pixelRatio)
    this.runtimeRenderer.render(
      buildRendererFrame(
        this.config,
        time,
        delta,
        this.pixelRatio,
        viewportSize
      )
    )

    return this.canvas
  }

  setConfig(config: ShaderLabConfig): void {
    this.config = config
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    this.width = width
    this.height = height
    if (pixelRatio !== undefined) {
      this.pixelRatio = pixelRatio
    }
    this.runtimeRenderer?.resize(
      { width: this.width, height: this.height },
      this.pixelRatio
    )
  }

  dispose(): void {
    this.disposed = true
    this.runtimeRenderer?.dispose()
    this.runtimeRenderer = null
  }

  get element(): HTMLCanvasElement {
    return this.canvas
  }
}
