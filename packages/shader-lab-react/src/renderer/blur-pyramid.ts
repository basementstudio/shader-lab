import {
  add,
  clamp,
  float,
  floor,
  If,
  log2,
  max,
  mix,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"

type Node = TSLNode

export const BLUR_PYRAMID_LEVELS = 7
const LEVEL_RADIUS = 1.2

const TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
} as const

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

type Stage = {
  input: Node
  material: THREE.MeshBasicNodeMaterial
  scene: THREE.Scene
}

/** Premultiplied blur levels at halving resolutions; each pixel can pick its own blur size. */
export class BlurPyramid {
  private readonly placeholder = new THREE.Texture()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly targets: THREE.WebGLRenderTarget[] = []
  private readonly stages: Stage[] = []
  private readonly texels: Node[] = []
  private readonly inputTexel: Node = uniform(new THREE.Vector2(1, 1))
  private readonly nodes: Node[] = []

  constructor() {
    for (let level = 0; level < BLUR_PYRAMID_LEVELS; level += 1) {
      const target = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
      this.targets.push(target)
      this.texels.push(uniform(new THREE.Vector2(1, 1)))
      this.nodes.push(tslTexture(target.texture, renderTargetUv()))
      const stage = this.createStage()
      stage.material.colorNode = this.buildDownsample(
        stage.input,
        level === 0,
        level === 0 ? this.inputTexel : (this.texels[level - 1] as Node)
      )
      this.stages.push(stage)
    }
  }

  private createStage(): Stage {
    const material = new THREE.MeshBasicNodeMaterial()
    material.blending = THREE.NoBlending
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(mesh)
    return { input: tslTexture(this.placeholder, renderTargetUv()), material, scene }
  }

  private buildDownsample(input: Node, premultiply: boolean, texel: Node): Node {
    const sourceUv = renderTargetUv()
    const tap = (dx: number, dy: number): Node => {
      const sample = input.sample(
        sourceUv.add(vec2(texel.x.mul(dx), texel.y.mul(dy)))
      )
      return premultiply
        ? vec4(vec3(sample.r, sample.g, sample.b).mul(sample.a), sample.a)
        : sample
    }
    const center = tap(0, 0)
    const inner = add(add(tap(-1, -1), tap(1, -1)), add(tap(-1, 1), tap(1, 1)))
    const cardinal = add(add(tap(-2, 0), tap(2, 0)), add(tap(0, -2), tap(0, 2)))
    const corners = add(add(tap(-2, -2), tap(2, -2)), add(tap(-2, 2), tap(2, 2)))
    return center
      .mul(0.125)
      .add(inner.mul(0.125))
      .add(cardinal.mul(0.0625))
      .add(corners.mul(0.03125))
  }

  resize(width: number, height: number): void {
    let levelWidth = Math.max(1, width)
    let levelHeight = Math.max(1, height)
    ;(this.inputTexel.value as THREE.Vector2).set(1 / levelWidth, 1 / levelHeight)
    for (let level = 0; level < BLUR_PYRAMID_LEVELS; level += 1) {
      levelWidth = Math.max(1, Math.floor(levelWidth / 2))
      levelHeight = Math.max(1, Math.floor(levelHeight / 2))
      ;(this.targets[level] as THREE.WebGLRenderTarget).setSize(levelWidth, levelHeight)
      ;(this.texels[level]?.value as THREE.Vector2).set(1 / levelWidth, 1 / levelHeight)
    }
  }

  render(renderer: THREE.WebGPURenderer, input: THREE.Texture): void {
    let source: THREE.Texture = input
    for (let level = 0; level < BLUR_PYRAMID_LEVELS; level += 1) {
      const stage = this.stages[level] as Stage
      const target = this.targets[level] as THREE.WebGLRenderTarget
      stage.input.value = source
      renderer.setRenderTarget(target)
      renderer.render(stage.scene, this.camera)
      source = target.texture
    }
    this.nodes.forEach((node, index) => {
      node.value = (this.targets[index] as THREE.WebGLRenderTarget).texture
    })
  }

  /** Fractional level for a blur radius measured in output pixels. */
  levelFor(radiusOutput: Node): Node {
    return log2(max(radiusOutput.div(LEVEL_RADIUS), float(1)))
  }

  private sampleBicubic(level: number, point: Node): Node {
    const node = this.nodes[level] as Node
    const texel = this.texels[level] as Node
    const size = vec2(float(1).div(texel.x), float(1).div(texel.y))
    const coord = point.mul(size).sub(0.5)
    const base = floor(coord)
    const f = coord.sub(base)
    const f2 = f.mul(f)
    const f3 = f2.mul(f)
    const w0 = vec2(1).sub(f).mul(vec2(1).sub(f)).mul(vec2(1).sub(f)).div(6)
    const w1 = f3.mul(3).sub(f2.mul(6)).add(4).div(6)
    const w2 = f3.mul(-3).add(f2.mul(3)).add(f.mul(3)).add(1).div(6)
    const w3 = f3.div(6)
    const g0 = w0.add(w1)
    const g1 = w2.add(w3)
    const h0 = base.sub(0.5).add(w1.div(g0)).mul(texel)
    const h1 = base.add(1.5).add(w3.div(g1)).mul(texel)
    const s00 = node.sample(vec2(h0.x, h0.y)).level(0)
    const s10 = node.sample(vec2(h1.x, h0.y)).level(0)
    const s01 = node.sample(vec2(h0.x, h1.y)).level(0)
    const s11 = node.sample(vec2(h1.x, h1.y)).level(0)
    return mix(mix(s00, s10, g1.x), mix(s01, s11, g1.x), g1.y)
  }

  /**
   * Premultiplied color at a fractional level. Level 0 reads the full-resolution
   * source through `color`; higher levels read the pyramid.
   */
  sample(color: Node, point: Node, level: Node, smooth: boolean): Node {
    const full = color.sample(point).level(0)
    const premultiplied = vec4(vec3(full.r, full.g, full.b).mul(full.a), full.a)
    const result = vec4(0).toVar()
    const clamped = clamp(level, 0, BLUR_PYRAMID_LEVELS)
    const index = floor(clamped)
    const fraction = clamped.sub(index)
    const pick = (k: number): Node => {
      if (k === 0) return premultiplied
      if (smooth) return this.sampleBicubic(k - 1, point)
      return (this.nodes[k - 1] as Node).sample(point).level(0)
    }
    for (let k = 0; k < BLUR_PYRAMID_LEVELS; k += 1) {
      If(index.equal(float(k)), () => {
        result.assign(mix(pick(k), pick(k + 1), fraction))
      })
    }
    If(index.greaterThanEqual(float(BLUR_PYRAMID_LEVELS)), () => {
      result.assign(pick(BLUR_PYRAMID_LEVELS))
    })
    return result
  }

  dispose(): void {
    for (const target of this.targets) target.dispose()
    for (const stage of this.stages) {
      stage.material.dispose()
      stage.scene.clear()
    }
    this.geometry.dispose()
    this.placeholder.dispose()
  }
}
