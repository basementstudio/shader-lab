import type * as THREE from "three/webgpu"
import { buildRendererFrame, DEFAULT_RENDERER_SIZE } from "./renderer/contracts"
import {
  createHeadlessRenderer,
  type HeadlessRenderer,
} from "./renderer/create-headless-renderer"
import type { ShaderLabConfig } from "./types"

function isWebGPURenderer(
  renderer: unknown
): renderer is THREE.WebGPURenderer & { isWebGPURenderer: true } {
  return (
    typeof renderer === "object" &&
    renderer !== null &&
    "isWebGPURenderer" in renderer &&
    (renderer as { isWebGPURenderer?: unknown }).isWebGPURenderer === true
  )
}

export interface ShaderLabPostProcessingSourceOptions {
  height?: number
  pixelRatio?: number
  renderer?: THREE.WebGPURenderer
  width?: number
}

export class ShaderLabPostProcessingSource {
  private headless: HeadlessRenderer | null = null
  private initPromise: Promise<void> | null = null
  private config: ShaderLabConfig
  private width: number
  private height: number
  private pixelRatio: number
  private disposed = false
  private currentTexture: THREE.Texture | null = null

  constructor(
    config: ShaderLabConfig,
    options?: ShaderLabPostProcessingSourceOptions
  ) {
    this.config = config
    this.width =
      options?.width ?? config.composition?.width ?? DEFAULT_RENDERER_SIZE.width
    this.height =
      options?.height ??
      config.composition?.height ??
      DEFAULT_RENDERER_SIZE.height
    this.pixelRatio = options?.pixelRatio ?? 1

    if (
      options?.renderer !== undefined &&
      !isWebGPURenderer(options.renderer)
    ) {
      throw new Error(
        "ShaderLab postprocessing requires a THREE.WebGPURenderer. Canvas-backed texture output can be used in WebGL scenes, but postprocessing cannot."
      )
    }

    this.headless = createHeadlessRenderer({
      ...(options?.renderer ? { renderer: options.renderer } : {}),
      size: { width: this.width, height: this.height },
    })
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<void> {
    if (!this.headless || this.disposed) return
    await this.headless.initialize()
    if (this.disposed) {
      this.headless.dispose()
      this.headless = null
      return
    }
    this.headless.resize(
      { width: this.width, height: this.height },
      this.pixelRatio
    )
  }

  update(
    inputTexture: THREE.Texture,
    time: number,
    delta: number
  ): THREE.Texture | null {
    if (!this.headless || this.disposed) return this.currentTexture

    const viewportSize = { width: this.width, height: this.height }
    const frame = buildRendererFrame(
      this.config,
      time,
      delta,
      this.pixelRatio,
      viewportSize,
      {
        logicalSize: viewportSize,
      }
    )
    this.currentTexture = this.headless.render(frame, inputTexture)
    return this.currentTexture
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
    this.headless?.resize(
      { width: this.width, height: this.height },
      this.pixelRatio
    )
  }

  dispose(): void {
    this.disposed = true
    this.headless?.dispose()
    this.headless = null
    this.currentTexture = null
  }

  get ready(): boolean {
    return this.headless !== null && this.initPromise !== null && !this.disposed
  }

  get texture(): THREE.Texture | null {
    return this.currentTexture
  }
}
