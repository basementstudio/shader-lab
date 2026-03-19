import type { OrthographicCamera, Scene } from "three"
import type { WebGPURenderer } from "three/webgpu"
import type { EditorRenderer, RendererFrame } from "@/features/editor/renderer/contracts"
import type { Size } from "@/features/editor/types"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<EditorRenderer> {
  const [{ Color, OrthographicCamera, Scene }, webgpuModule] = await Promise.all([
    import("three"),
    import("three/webgpu"),
  ])

  const scene: Scene = new Scene()
  scene.background = new Color("#0a0d10")

  const camera: OrthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 1

  const renderer: WebGPURenderer = new webgpuModule.WebGPURenderer({
    alpha: false,
    antialias: true,
    canvas,
  })

  return {
    async initialize() {
      await renderer.init()
      renderer.setClearColor("#0a0d10", 1)
    },

    resize(size: Size, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
    },

    render(_frame: RendererFrame) {
      renderer.render(scene, camera)
    },

    dispose() {
      renderer.setAnimationLoop(null)
      renderer.dispose()
    },
  }
}
