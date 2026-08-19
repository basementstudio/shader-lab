declare module "three/webgpu" {
  export * from "three"

  import type {
    Box3,
    Camera,
    ColorRepresentation,
    Material,
    Scene,
    Texture,
    TypedArray,
    Vector3,
    WebGLRendererParameters,
    WebGLRenderTarget,
  } from "three"
  import type { TSLNode } from "three/tsl"

  export class MeshBasicNodeMaterial extends Material {
    colorNode: TSLNode | null
    opacityNode: TSLNode | null
    positionNode: TSLNode | null
  }

  export class PointsNodeMaterial extends Material {
    colorNode: TSLNode | null
    opacityNode: TSLNode | null
    positionNode: TSLNode | null
    sizeNode: TSLNode | null
    alphaTest: number
    transparent: boolean
    depthWrite: boolean
    sizeAttenuation: boolean
  }

  export class StorageTexture extends Texture {
    constructor(width?: number, height?: number)
    isStorageTexture: true
  }

  export class WebGPURenderer {
    constructor(
      options?: WebGLRendererParameters & { canvas?: HTMLCanvasElement }
    )

    // biome-ignore lint/suspicious/noExplicitAny: compute node type from Fn().compute() is opaque
    compute(computeNodes: any): void
    // biome-ignore lint/suspicious/noExplicitAny: compute node type from Fn().compute() is opaque
    computeAsync(computeNodes: any): Promise<void>
    clear(): void
    copyTextureToTexture(
      srcTexture: Texture,
      dstTexture: Texture,
      srcRegion?: Box3 | null,
      dstPosition?: Vector3 | null,
      srcLevel?: number,
      dstLevel?: number
    ): void
    dispose(): void
    init(): Promise<void>
    readRenderTargetPixelsAsync(
      target: WebGLRenderTarget,
      x: number,
      y: number,
      width: number,
      height: number
    ): Promise<TypedArray>
    render(scene: Scene, camera: Camera): void
    setAnimationLoop(callback: ((time: number) => void) | null): void
    setClearColor(color: ColorRepresentation, alpha?: number): void
    setPixelRatio(pixelRatio: number): void
    setRenderTarget(target: WebGLRenderTarget | null): void
    setSize(width: number, height: number, updateStyle?: boolean): void
  }
}
