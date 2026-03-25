declare module "three/webgpu" {
  export * from "three"

  import type {
    Camera,
    ColorRepresentation,
    Color,
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

  export class MeshStandardNodeMaterial extends Material {
    color: Color
    colorNode: TSLNode | null
    envMapIntensity: number
    metalness: number
    metalnessNode: TSLNode | null
    normalNode: TSLNode | null
    opacityNode: TSLNode | null
    positionNode: TSLNode | null
    roughness: number
    roughnessNode: TSLNode | null
  }

  export class MeshPhysicalNodeMaterial extends MeshStandardNodeMaterial {
    anisotropyNode: TSLNode | null
    clearcoatNode: TSLNode | null
    clearcoatRoughness: number
    clearcoatRoughnessNode: TSLNode | null
    emissiveNode: TSLNode | null
    specularColor: Color
    specularColorNode: TSLNode | null
    specularIntensity: number
    specularIntensityNode: TSLNode | null
  }

  export class MeshPhongNodeMaterial extends Material {
    color: Color
    colorNode: TSLNode | null
    normalNode: TSLNode | null
    opacityNode: TSLNode | null
    positionNode: TSLNode | null
    shininess: number
    shininessNode: TSLNode | null
    specularNode: TSLNode | null
  }

  export class MeshToonNodeMaterial extends Material {
    color: Color
    colorNode: TSLNode | null
    normalNode: TSLNode | null
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

  export { PMREMGenerator } from "three"
}
