import type { TSLNode } from "three/tsl"
import * as THREE from "three/webgpu"

const TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

export class GridRenderPass {
  readonly target: THREE.WebGLRenderTarget

  private readonly scene: THREE.Scene
  private readonly camera: THREE.OrthographicCamera
  private readonly material: THREE.MeshBasicNodeMaterial
  private width = 1
  private height = 1

  constructor() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.target = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  get texture(): THREE.Texture {
    return this.target.texture
  }

  setColorNode(node: TSLNode): void {
    this.material.colorNode = node as unknown as THREE.MeshBasicNodeMaterial["colorNode"]
    this.material.needsUpdate = true
  }

  setSize(width: number, height: number): boolean {
    const nextWidth = Math.max(1, Math.round(width))
    const nextHeight = Math.max(1, Math.round(height))

    if (nextWidth === this.width && nextHeight === this.height) {
      return false
    }

    this.width = nextWidth
    this.height = nextHeight
    this.target.setSize(nextWidth, nextHeight)
    return true
  }

  render(renderer: THREE.WebGPURenderer): void {
    renderer.setRenderTarget(this.target)
    renderer.render(this.scene, this.camera)
  }

  getCompileTarget(): { camera: THREE.Camera; scene: THREE.Scene } {
    return { camera: this.camera, scene: this.scene }
  }

  dispose(): void {
    this.scene.clear()
    this.material.dispose()
    this.target.dispose()
  }
}
