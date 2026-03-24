declare module "three/webgpu" {
  export * from "three"

  import type {
    Camera,
    ColorRepresentation,
    Material,
    Scene,
    TypedArray,
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

  export class WebGPURenderer {
    constructor(options?: WebGLRendererParameters & { canvas?: HTMLCanvasElement })

    dispose(): void
    init(): Promise<void>
    readRenderTargetPixelsAsync(
      target: WebGLRenderTarget,
      x: number,
      y: number,
      width: number,
      height: number,
    ): Promise<TypedArray>
    render(scene: Scene, camera: Camera): void
    setAnimationLoop(callback: ((time: number) => void) | null): void
    setClearColor(color: ColorRepresentation, alpha?: number): void
    setPixelRatio(pixelRatio: number): void
    setRenderTarget(target: WebGLRenderTarget | null): void
    setSize(width: number, height: number, updateStyle?: boolean): void
  }
}
