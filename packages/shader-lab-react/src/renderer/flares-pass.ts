import {
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  Fn,
  int,
  Loop,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  step,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const FIELD_DIVISOR = 4
const MAX_RAYS = 16
const MAX_RAY_TAPS = 320

const TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

const BOX_TAPS = Array.from(
  { length: 16 },
  (_, index) => [(index % 4) - 1.5, Math.floor(index / 4) - 1.5] as const
)
const RING = Array.from(
  { length: 8 },
  (_, index) =>
    [
      Math.cos((index / 8) * Math.PI * 2),
      Math.sin((index / 8) * Math.PI * 2),
    ] as const
)

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

function perceptualLuma(color: Node): Node {
  const luma = clamp(
    dot(vec3(color.r, color.g, color.b), vec3(0.2126, 0.7152, 0.0722)),
    0,
    1
  )
  return select(
    luma.lessThanEqual(float(0.0031308)),
    luma.mul(12.92),
    pow(luma, float(1 / 2.4)).mul(1.055).sub(0.055)
  )
}

function readNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback
}

type Stage = {
  input: Node
  material: THREE.MeshBasicNodeMaterial
  scene: THREE.Scene
}

export class FlaresPass extends PassNode {
  private readonly thresholdUniform: Node
  private readonly isolationUniform: Node
  private readonly thicknessUniform: Node
  private readonly raysUniform: Node
  private readonly rotationUniform: Node
  private readonly lengthUniform: Node
  private readonly secondaryUniform: Node
  private readonly jitterUniform: Node
  private readonly falloffUniform: Node
  private readonly seedUniform: Node
  private readonly coreSizeUniform: Node
  private readonly intensityUniform: Node
  private readonly coreGlowUniform: Node
  private readonly colorUniform: Node
  private readonly coreColorUniform: Node
  private readonly documentTexelUniform: Node
  private readonly inputTexelUniform: Node
  private readonly tapSpacingUniform: Node
  private readonly placeholder = new THREE.Texture()
  private readonly stageCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly pointTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
  private readonly rayTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
  private readonly pointStage: Stage
  private readonly rayStage: Stage
  private fieldNode: Node | null = null
  private colorNode: Node | null = null
  private outputWidth = 1
  private outputHeight = 1
  private logicalWidth = 1
  private logicalHeight = 1

  constructor(layerId: string) {
    super(layerId)
    this.thresholdUniform = uniform(0.85)
    this.isolationUniform = uniform(10)
    this.thicknessUniform = uniform(1)
    this.raysUniform = uniform(4)
    this.rotationUniform = uniform(0)
    this.lengthUniform = uniform(120)
    this.secondaryUniform = uniform(1)
    this.jitterUniform = uniform(0)
    this.falloffUniform = uniform(1.5)
    this.seedUniform = uniform(0)
    this.coreSizeUniform = uniform(6)
    this.intensityUniform = uniform(4)
    this.coreGlowUniform = uniform(1)
    this.colorUniform = uniform(new THREE.Color("#ff7a3d"))
    this.coreColorUniform = uniform(new THREE.Color("#fff3e0"))
    this.documentTexelUniform = uniform(new THREE.Vector2(1, 1))
    this.inputTexelUniform = uniform(new THREE.Vector2(1, 1))
    this.tapSpacingUniform = uniform(3)
    this.pointStage = this.createStage()
    this.pointStage.material.colorNode = this.buildPointNode(this.pointStage.input)
    this.rayStage = this.createStage()
    this.rayStage.material.colorNode = this.buildRayNode(this.rayStage.input)
    this.rebuildEffectNode()
  }

  private createStage(): Stage {
    const material = new THREE.MeshBasicNodeMaterial()
    material.blending = THREE.NoBlending
    const mesh = new THREE.Mesh(this.geometry, material)
    mesh.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(mesh)
    return {
      input: tslTexture(this.placeholder, renderTargetUv()),
      material,
      scene,
    }
  }

  private brightness(color: Node): Node {
    return smoothstep(
      this.thresholdUniform,
      float(1),
      perceptualLuma(color)
    ).mul(clamp(float(color.a), 0, 1))
  }

  private buildPointNode(input: Node): Node {
    const sourceUv = renderTargetUv()
    const spacing = max(
      this.inputTexelUniform.mul(FIELD_DIVISOR / 4),
      this.documentTexelUniform.mul(this.thicknessUniform.mul(0.5))
    )
    let bright: Node = float(0)
    for (const [x, y] of BOX_TAPS) {
      bright = bright.add(
        this.brightness(input.sample(sourceUv.add(vec2(x, y).mul(spacing))))
      )
    }
    bright = bright.div(BOX_TAPS.length)
    const reach = this.documentTexelUniform.mul(this.isolationUniform)
    let surround: Node = float(0)
    for (const [x, y] of RING) {
      surround = surround.add(
        this.brightness(input.sample(sourceUv.add(vec2(x, y).mul(reach))))
      )
    }
    const isolated = surround
      .div(RING.length)
      .mul(step(float(0.5), this.isolationUniform))
    const point = max(bright.sub(isolated), float(0))
    return vec4(point, point, point, float(1))
  }

  private buildRayNode(input: Node): Node {
    return Fn(() => {
      const sourceUv = renderTargetUv()
      const rays = this.raysUniform
      const rotation = this.rotationUniform.mul(Math.PI / 180)
      const texel = this.documentTexelUniform
      const total = float(0).toVar()
      const near = float(0).toVar()
      Loop({ start: 0, end: int(rays), type: "int", name: "rayIndex" }, (inputs) => {
        const ray = float((inputs as unknown as Record<string, Node>).rayIndex)
        const angle = rotation.add(ray.mul(Math.PI * 2).div(max(rays, float(1))))
        const direction = vec2(cos(angle), sin(angle).negate())
        const jitter = fract(
          sin(ray.mul(12.9898).add(this.seedUniform.mul(78.233))).mul(43758.5453)
        )
        const lengthScale = select(
          ray.mod(2).greaterThan(0.5),
          this.secondaryUniform,
          float(1)
        ).mul(mix(float(1), jitter.mul(0.85).add(0.15), this.jitterUniform))
        const reach = this.lengthUniform.mul(lengthScale)
        const count = clamp(
          floor(reach.div(this.tapSpacingUniform)).add(1),
          float(4),
          float(MAX_RAY_TAPS)
        )
        const dt = float(1).div(count)
        Loop(
          { start: 1, end: int(count).add(1), type: "int", name: "tapIndex" },
          (taps) => {
          const t = float((taps as unknown as Record<string, Node>).tapIndex).mul(dt)
          const point = float(
            input.sample(sourceUv.sub(direction.mul(texel).mul(reach.mul(t)))).r
          )
          const fade = float(1).sub(t)
          const weight = pow(fade, this.falloffUniform).mul(point).mul(dt)
          total.addAssign(weight)
          near.addAssign(weight.mul(pow(fade, float(10))))
          }
        )
      })
      const coreReach = texel.mul(this.coreSizeUniform)
      let core: Node = float(input.sample(sourceUv).r)
      for (const [x, y] of RING) {
        core = core.add(
          float(input.sample(sourceUv.add(vec2(x, y).mul(coreReach))).r).mul(0.5)
        )
      }
      return vec4(total, near, core.div(5), float(1))
    })()
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.outputHeight = Math.max(1, height)
    const fieldWidth = Math.max(1, Math.floor(this.outputWidth / FIELD_DIVISOR))
    const fieldHeight = Math.max(1, Math.floor(this.outputHeight / FIELD_DIVISOR))
    this.pointTarget.setSize(fieldWidth, fieldHeight)
    this.rayTarget.setSize(fieldWidth, fieldHeight)
    ;(this.inputTexelUniform.value as THREE.Vector2).set(
      1 / this.outputWidth,
      1 / this.outputHeight
    )
    this.syncTapSpacing()
  }

  private syncTapSpacing(): void {
    this.tapSpacingUniform.value =
      FIELD_DIVISOR * (this.logicalWidth / this.outputWidth) * 0.7
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    ;(this.documentTexelUniform.value as THREE.Vector2).set(
      1 / this.logicalWidth,
      1 / this.logicalHeight
    )
    this.syncTapSpacing()
  }

  override updateParams(params: LayerParameterValues): void {
    this.thresholdUniform.value = readNumber(params.threshold, 0.85, 0, 1)
    this.isolationUniform.value = readNumber(params.isolation, 10, 0, 120)
    this.thicknessUniform.value = readNumber(params.thickness, 1, 0, 16)
    this.raysUniform.value = Math.round(readNumber(params.rays, 4, 1, MAX_RAYS))
    this.rotationUniform.value = readNumber(params.rotation, 0, -180, 180)
    this.lengthUniform.value = readNumber(params.length, 120, 4, 1200)
    this.secondaryUniform.value = readNumber(params.secondaryLength, 1, 0, 2)
    this.jitterUniform.value = readNumber(params.lengthJitter, 0, 0, 1)
    this.falloffUniform.value = readNumber(params.falloff, 1.5, 0.2, 6)
    this.seedUniform.value = readNumber(params.seed, 0, 0, 999)
    this.coreSizeUniform.value = readNumber(params.coreSize, 6, 0, 80)
    this.intensityUniform.value = readNumber(params.intensity, 4, 0, 12)
    this.coreGlowUniform.value = readNumber(params.coreGlow, 1, 0, 4)
    ;(this.colorUniform.value as THREE.Color).set(
      typeof params.color === "string" ? params.color : "#ff7a3d"
    )
    ;(this.coreColorUniform.value as THREE.Color).set(
      typeof params.coreColor === "string" ? params.coreColor : "#fff3e0"
    )
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.pointStage.input.value = inputTexture
    renderer.setRenderTarget(this.pointTarget)
    renderer.render(this.pointStage.scene, this.stageCamera)
    this.rayStage.input.value = this.pointTarget.texture
    renderer.setRenderTarget(this.rayTarget)
    renderer.render(this.rayStage.scene, this.stageCamera)
    if (this.fieldNode) this.fieldNode.value = this.rayTarget.texture
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override buildEffectNode(): Node {
    if (!this.intensityUniform) {
      return this.inputNode
    }
    const targetUv = renderTargetUv()
    const field = tslTexture(this.placeholder, targetUv)
    this.fieldNode = field
    const color = tslTexture(this.placeholder, targetUv)
    this.colorNode = color
    const source = vec3(color.r, color.g, color.b)
    const sourceAlpha = clamp(float(color.a), 0, 1)

    const gain = this.intensityUniform.mul(6)
    const rays = float(1).sub(exp(float(field.r).mul(gain).negate()))
    const heat = clamp(
      float(field.g).div(max(float(field.r), float(0.0001))),
      0,
      1
    )
    const core = float(1)
      .sub(exp(float(field.b).mul(gain).mul(this.coreGlowUniform).negate()))
      .mul(step(float(0.0001), this.coreGlowUniform))
    const rayColor = mix(this.colorUniform, this.coreColorUniform, heat)
    const light = clamp(
      rayColor.mul(rays).add(vec3(this.coreColorUniform).mul(core)),
      0,
      1
    )
    const screened = float(1).sub(
      float(1).sub(source).mul(vec3(1).sub(light))
    )
    const coverage = max(sourceAlpha, max(rays, core))
    const rgb = mix(light, screened, sourceAlpha.div(max(coverage, float(0.0001))))
    return vec4(rgb, coverage)
  }

  override dispose(): void {
    this.pointTarget.dispose()
    this.rayTarget.dispose()
    for (const stage of [this.pointStage, this.rayStage]) {
      stage.material.dispose()
      stage.scene.clear()
    }
    this.geometry.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
