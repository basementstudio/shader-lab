declare module "three/webgpu" {
  export class WebGPURenderer {
    constructor(options?: {
      alpha?: boolean
      antialias?: boolean
      canvas?: HTMLCanvasElement
    })

    dispose(): void
    init(): Promise<void>
    render(scene: unknown, camera: unknown): void
    setAnimationLoop(callback: ((time: number) => void) | null): void
    setClearColor(color: string, alpha?: number): void
    setPixelRatio(pixelRatio: number): void
    setSize(width: number, height: number, updateStyle?: boolean): void
  }
}
