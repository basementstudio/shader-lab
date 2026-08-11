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
  private readonly scene: THREE.Scene
  private readonly camera: THREE.OrthographicCamera
  private readonly material: THREE.MeshBasicNodeMaterial
  private readonly targets: THREE.WebGLRenderTarget[]
  private currentIndex = 0
  private width = 1
  private height = 1

  constructor(options: { linear?: boolean; pingPong?: boolean } = {}) {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.material = new THREE.MeshBasicNodeMaterial()
    this.targets = [new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)]

    if (options.pingPong) {
      this.targets.push(new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS))
    }

    if (options.linear) {
      for (const target of this.targets) {
        target.texture.magFilter = THREE.LinearFilter
        target.texture.minFilter = THREE.LinearFilter
      }
    }

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }

  get target(): THREE.WebGLRenderTarget {
    return this.targets[this.currentIndex] as THREE.WebGLRenderTarget
  }

  get texture(): THREE.Texture {
    return this.target.texture
  }

  get previousTexture(): THREE.Texture {
    const previous =
      this.targets[(this.currentIndex + 1) % this.targets.length]
    return (previous ?? this.target).texture
  }

  setColorNode(node: TSLNode): void {
    this.material.colorNode =
      node as unknown as THREE.MeshBasicNodeMaterial["colorNode"]
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

    for (const target of this.targets) {
      target.setSize(nextWidth, nextHeight)
    }

    return true
  }

  render(renderer: THREE.WebGPURenderer): void {
    const writeIndex = (this.currentIndex + 1) % this.targets.length
    const writeTarget = this.targets[writeIndex] as THREE.WebGLRenderTarget

    renderer.setRenderTarget(writeTarget)
    renderer.render(this.scene, this.camera)
    this.currentIndex = writeIndex
  }

  getCompileTarget(): { camera: THREE.Camera; scene: THREE.Scene } {
    return { camera: this.camera, scene: this.scene }
  }

  dispose(): void {
    this.scene.clear()
    this.material.dispose()

    for (const target of this.targets) {
      target.dispose()
    }
  }
}
