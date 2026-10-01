import {
  clamp,
  float,
  positionWorld,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"

const RESOLUTION = 512
const TAPS = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
const SIGMA = 2.2
const WEIGHTS = (() => {
  const raw = TAPS.map((tap) => Math.exp(-(tap * tap) / (2 * SIGMA * SIGMA)))
  const total = raw.reduce((sum, value) => sum + value, 0)
  return raw.map((value) => value / total)
})()

function renderTargetUv(): TSLNode {
  return vec2(uv().x, float(1).sub(uv().y))
}

export class ModelContactShadow {
  readonly mesh: THREE.Mesh
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly target: THREE.WebGLRenderTarget
  private readonly blurTarget: THREE.WebGLRenderTarget
  private readonly heightMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly planeMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly planeGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly blurScene = new THREE.Scene()
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly blurGeometry = new THREE.PlaneGeometry(2, 2)
  private readonly blurMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly blurInput: TSLNode
  private readonly blurPlaceholder = new THREE.Texture()
  private readonly direction = uniform(new THREE.Vector2(1, 0))
  private readonly floorY = uniform(0)
  private readonly fadeHeight = uniform(1)
  private readonly opacity = uniform(0.6)
  private readonly viewProjection = uniform(new THREE.Matrix4())
  private blurRadius = 2

  constructor() {
    const options = {
      depthBuffer: false,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    }
    this.target = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      ...options,
      depthBuffer: true,
    })
    this.blurTarget = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options)

    this.heightMaterial.blending = THREE.NoBlending
    this.heightMaterial.side = THREE.DoubleSide
    const height = positionWorld.y.sub(this.floorY)
    const darkness = clamp(
      float(1).sub(height.div(this.fadeHeight)),
      float(0),
      float(1)
    )
    this.heightMaterial.colorNode = vec4(0, 0, 0, darkness)

    const clip = this.viewProjection.mul(vec4(positionWorld, 1))
    const ndc = clip.xy.div(clip.w)
    const lookup = vec2(
      ndc.x.mul(0.5).add(0.5),
      float(0.5).sub(ndc.y.mul(0.5))
    )
    const shadow = texture(this.target.texture, lookup)
    this.planeMaterial.transparent = true
    this.planeMaterial.depthWrite = false
    this.planeMaterial.colorNode = vec4(
      0,
      0,
      0,
      float(shadow.a).mul(this.opacity)
    )
    this.mesh = new THREE.Mesh(this.planeGeometry, this.planeMaterial)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false

    this.blurInput = texture(this.blurPlaceholder, renderTargetUv())
    this.blurMaterial.blending = THREE.NoBlending
    let sum: TSLNode = vec4(0)
    const step = vec2(this.direction).mul(float(1 / RESOLUTION))
    TAPS.forEach((tap, index) => {
      sum = sum.add(
        this.blurInput
          .sample(renderTargetUv().add(step.mul(float(tap))))
          .mul(float(WEIGHTS[index] ?? 0))
      )
    })
    this.blurMaterial.colorNode = sum
    const blurMesh = new THREE.Mesh(this.blurGeometry, this.blurMaterial)
    blurMesh.frustumCulled = false
    this.blurScene.add(blurMesh)
  }

  update(settings: {
    blur: number
    centerX: number
    centerZ: number
    extent: number
    fadeHeight: number
    floorY: number
    opacity: number
  }): void {
    const extent = Math.max(0.001, settings.extent)
    this.camera.left = -extent
    this.camera.right = extent
    this.camera.top = extent
    this.camera.bottom = -extent
    this.camera.near = 0
    this.camera.far = Math.max(0.001, settings.fadeHeight)
    this.camera.position.set(settings.centerX, settings.floorY, settings.centerZ)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(settings.centerX, settings.floorY + 1, settings.centerZ)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
    ;(this.viewProjection.value as THREE.Matrix4).multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    this.floorY.value = settings.floorY
    this.fadeHeight.value = Math.max(0.001, settings.fadeHeight)
    this.opacity.value = Math.min(1, Math.max(0, settings.opacity))
    this.blurRadius = Math.max(0, settings.blur) * 6
    this.mesh.position.set(
      settings.centerX,
      settings.floorY + extent * 0.0005,
      settings.centerZ
    )
    this.mesh.scale.set(extent * 2, extent * 2, 1)
  }

  render(renderer: THREE.WebGPURenderer, scene: THREE.Scene): void {
    const override = scene.overrideMaterial
    scene.overrideMaterial = this.heightMaterial
    try {
      renderer.setRenderTarget(this.target)
      renderer.render(scene, this.camera)
    } finally {
      scene.overrideMaterial = override
    }
    if (this.blurRadius <= 0.01) {
      return
    }
    for (const radius of [this.blurRadius, this.blurRadius * 0.5]) {
      this.blurPass(renderer, this.target, this.blurTarget, radius, 0)
      this.blurPass(renderer, this.blurTarget, this.target, radius, 1)
    }
  }

  dispose(): void {
    this.target.dispose()
    this.blurTarget.dispose()
    this.heightMaterial.dispose()
    this.planeMaterial.dispose()
    this.planeGeometry.dispose()
    this.blurMaterial.dispose()
    this.blurGeometry.dispose()
    this.blurPlaceholder.dispose()
    this.blurScene.clear()
  }

  private blurPass(
    renderer: THREE.WebGPURenderer,
    source: THREE.WebGLRenderTarget,
    destination: THREE.WebGLRenderTarget,
    radius: number,
    axis: 0 | 1
  ): void {
    this.blurInput.value = source.texture
    ;(this.direction.value as THREE.Vector2).set(
      axis === 0 ? radius : 0,
      axis === 1 ? radius : 0
    )
    renderer.setRenderTarget(destination)
    renderer.render(this.blurScene, this.blurCamera)
  }
}
