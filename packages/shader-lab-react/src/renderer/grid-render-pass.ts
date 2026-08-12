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
  private readonly camera: THREE.OrthographicCamera
  private readonly geometry: THREE.PlaneGeometry
  private readonly scenes: [THREE.Scene, THREE.Scene]
  private readonly materials: [
    THREE.MeshBasicNodeMaterial,
    THREE.MeshBasicNodeMaterial,
  ]
  private readonly targets: THREE.WebGLRenderTarget[]
  private activeIndex = 0
  private swapGeneration = 0
  private currentIndex = 0
  private width = 1
  private height = 1

  constructor(options: { linear?: boolean; pingPong?: boolean } = {}) {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.geometry = new THREE.PlaneGeometry(2, 2)
    this.materials = [
      new THREE.MeshBasicNodeMaterial(),
      new THREE.MeshBasicNodeMaterial(),
    ]
    this.scenes = [new THREE.Scene(), new THREE.Scene()]

    for (const [index, scene] of this.scenes.entries()) {
      const mesh = new THREE.Mesh(
        this.geometry,
        this.materials[index] as THREE.MeshBasicNodeMaterial
      )
      mesh.frustumCulled = false
      scene.add(mesh)
    }

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

  private get activeMaterial(): THREE.MeshBasicNodeMaterial {
    return this.materials[this.activeIndex] as THREE.MeshBasicNodeMaterial
  }

  setColorNode(node: TSLNode): void {
    this.swapGeneration += 1
    this.activeMaterial.colorNode =
      node as unknown as THREE.MeshBasicNodeMaterial["colorNode"]
    this.activeMaterial.needsUpdate = true
  }

  async setColorNodeAsync(
    node: TSLNode,
    renderer: THREE.WebGPURenderer
  ): Promise<boolean> {
    const generation = ++this.swapGeneration
    const standbyIndex = 1 - this.activeIndex
    const material = this.materials[standbyIndex] as THREE.MeshBasicNodeMaterial
    material.colorNode =
      node as unknown as THREE.MeshBasicNodeMaterial["colorNode"]
    material.needsUpdate = true

    const compiler = renderer as unknown as {
      compileAsync(scene: THREE.Scene, camera: THREE.Camera): Promise<void>
      getRenderTarget(): THREE.WebGLRenderTarget | null
      setRenderTarget(target: THREE.WebGLRenderTarget | null): void
    }
    const previousTarget = compiler.getRenderTarget()
    compiler.setRenderTarget(this.target)

    try {
      await compiler.compileAsync(
        this.scenes[standbyIndex] as THREE.Scene,
        this.camera
      )
    } finally {
      compiler.setRenderTarget(previousTarget)
    }

    if (generation !== this.swapGeneration) {
      return false
    }

    this.activeIndex = standbyIndex
    return true
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
    renderer.render(this.scenes[this.activeIndex] as THREE.Scene, this.camera)
    this.currentIndex = writeIndex
  }

  getCompileTarget(): { camera: THREE.Camera; scene: THREE.Scene } {
    return {
      camera: this.camera,
      scene: this.scenes[this.activeIndex] as THREE.Scene,
    }
  }

  dispose(): void {
    for (const scene of this.scenes) {
      scene.clear()
    }

    for (const material of this.materials) {
      material.dispose()
    }

    this.geometry.dispose()

    for (const target of this.targets) {
      target.dispose()
    }
  }
}
