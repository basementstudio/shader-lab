import {
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  fwidth,
  max,
  mix,
  pow,
  select,
  smoothstep,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  buildLinearColorMap,
  COLOR_MAP_LUT_SIZE,
  DEFAULT_COLOR_HALOS_STOPS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "./color-map-lut"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const MIN_DIVISOR = 4
const MAX_DIVISOR = 16
const TAPS = 16
const RING = Array.from({ length: 8 }, (_, index) => [
  Math.cos((index / 8) * Math.PI * 2),
  Math.sin((index / 8) * Math.PI * 2),
] as const)
const GLOW_DARK = 0
const GLOW_LIGHT = 1
const GLOW_ALPHA = 2
const GLOW_MODES: Record<string, number> = {
  alpha: GLOW_ALPHA,
  dark: GLOW_DARK,
  light: GLOW_LIGHT,
}

const TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

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

const GAUSSIAN = Array.from({ length: TAPS * 2 + 1 }, (_, index) => {
  const x = ((index - TAPS) / TAPS) * 3
  return Math.exp(-(x * x) / 2)
})
const GAUSSIAN_SUM = GAUSSIAN.reduce((sum, weight) => sum + weight, 0)
const STREAK_TAPS = 32
const STREAK = Array.from({ length: STREAK_TAPS * 2 + 1 }, (_, index) =>
  Math.exp(-Math.abs(((index - STREAK_TAPS) / STREAK_TAPS) * 4))
)
const STREAK_SUM = STREAK.reduce((sum, weight) => sum + weight, 0)

const BOX_TAPS = Array.from({ length: 16 }, (_, index) => [
  (index % 4) - 1.5,
  Math.floor(index / 4) - 1.5,
] as const)

type Stage = {
  input: Node
  material: THREE.MeshBasicNodeMaterial
  scene: THREE.Scene
}

export class ColorHalosPass extends PassNode {
  private readonly glowFromUniform: Node
  private readonly thresholdUniform: Node
  private readonly intensityUniform: Node
  private readonly reachUniform: Node
  private readonly bandsUniform: Node
  private readonly keepShapeUniform: Node
  private readonly amountUniform: Node
  private readonly flareUniform: Node
  private readonly flareThresholdUniform: Node
  private readonly flareColorUniform: Node
  private readonly haloStepUniform: Node
  private readonly flareStepUniform: Node
  private readonly inputTexelUniform: Node
  private readonly lut: THREE.DataTexture
  private readonly placeholder = new THREE.Texture()
  private readonly stageCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly geometry = new THREE.PlaneGeometry(2, 2)
  private readonly maskTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
  private readonly horizontalTarget = new THREE.WebGLRenderTarget(
    1,
    1,
    TARGET_OPTIONS
  )
  private readonly fieldTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
  private readonly smoothTarget = new THREE.WebGLRenderTarget(1, 1, TARGET_OPTIONS)
  private readonly maskStage: Stage
  private readonly horizontalStage: Stage
  private readonly verticalStage: Stage
  private readonly smoothHorizontalStage: Stage
  private readonly smoothVerticalStage: Stage
  private fieldNode: Node | null = null
  private colorNode: Node | null = null
  private stopsKey = ""
  private spread = 40
  private flareLength = 160
  private logicalWidth = 1
  private outputWidth = 1
  private outputHeight = 1
  private fieldWidth = 1
  private fieldHeight = 1

  constructor(layerId: string) {
    super(layerId)
    this.glowFromUniform = uniform(GLOW_DARK)
    this.thresholdUniform = uniform(0.5)
    this.intensityUniform = uniform(1.6)
    this.reachUniform = uniform(0.08)
    this.bandsUniform = uniform(0)
    this.keepShapeUniform = uniform(1)
    this.amountUniform = uniform(1)
    this.flareUniform = uniform(0)
    this.flareThresholdUniform = uniform(0.8)
    this.flareColorUniform = uniform(new THREE.Color("#ff7a3d"))
    this.haloStepUniform = uniform(new THREE.Vector2(0, 0))
    this.flareStepUniform = uniform(new THREE.Vector2(0, 0))
    this.inputTexelUniform = uniform(new THREE.Vector2(0, 0))
    this.lut = new THREE.DataTexture(
      new Float32Array(COLOR_MAP_LUT_SIZE * 4),
      COLOR_MAP_LUT_SIZE,
      1,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    this.lut.magFilter = THREE.LinearFilter
    this.lut.minFilter = THREE.LinearFilter
    this.lut.generateMipmaps = false
    this.maskStage = this.createStage()
    this.maskStage.material.colorNode = this.buildMaskNode(this.maskStage.input)
    this.horizontalStage = this.createStage()
    this.horizontalStage.material.colorNode = this.buildHorizontalNode(
      this.horizontalStage.input
    )
    this.verticalStage = this.createStage()
    this.verticalStage.material.colorNode = this.buildVerticalNode(
      this.verticalStage.input
    )
    this.smoothHorizontalStage = this.createStage()
    this.smoothHorizontalStage.material.colorNode = this.buildSmoothNode(
      this.smoothHorizontalStage.input,
      true
    )
    this.smoothVerticalStage = this.createStage()
    this.smoothVerticalStage.material.colorNode = this.buildSmoothNode(
      this.smoothVerticalStage.input,
      false
    )
    this.updateParams({})
    this.rebuildEffectNode()
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

  private glowMask(color: Node): Node {
    const tone = perceptualLuma(color)
    const alpha = clamp(float(color.a), 0, 1)
    const mode = this.glowFromUniform
    const strength = select(
      mode.lessThan(0.5),
      float(1).sub(tone),
      select(mode.lessThan(1.5), tone, float(1))
    )
    const threshold = this.thresholdUniform
    return smoothstep(threshold.sub(0.12), threshold.add(0.12), strength).mul(
      alpha
    )
  }

  private buildMaskNode(input: Node): Node {
    const sourceUv = renderTargetUv()
    let glow: Node = float(0)
    let flare: Node = float(0)
    for (const [x, y] of BOX_TAPS) {
      const tap = input.sample(
        sourceUv.add(vec2(this.inputTexelUniform.x.mul(x), this.inputTexelUniform.y.mul(y)))
      )
      glow = glow.add(this.glowMask(tap))
      flare = flare.add(
        smoothstep(this.flareThresholdUniform, float(1), perceptualLuma(tap)).mul(
          clamp(float(tap.a), 0, 1)
        )
      )
    }
    const count = 1 / BOX_TAPS.length
    let surround: Node = float(0)
    for (const [x, y] of RING) {
      const tap = input.sample(
        sourceUv.add(
          vec2(this.inputTexelUniform.x.mul(x * 10), this.inputTexelUniform.y.mul(y * 10))
        )
      )
      surround = surround.add(
        smoothstep(this.flareThresholdUniform, float(1), perceptualLuma(tap))
      )
    }
    const point = max(flare.mul(count).sub(surround.div(RING.length)), float(0))
    return vec4(glow.mul(count), point, point, float(1))
  }

  private buildHorizontalNode(input: Node): Node {
    const sourceUv = renderTargetUv()
    let halo: Node = float(0)
    let streak: Node = float(0)
    for (let index = 0; index <= TAPS * 2; index += 1) {
      const offset = index - TAPS
      const haloTap = input.sample(
        sourceUv.add(vec2(this.haloStepUniform.x.mul(offset), 0))
      )
      halo = halo.add(float(haloTap.r).mul(GAUSSIAN[index] as number))
    }
    for (let index = 0; index <= STREAK_TAPS * 2; index += 1) {
      const streakTap = input.sample(
        sourceUv.add(vec2(this.flareStepUniform.x.mul(index - STREAK_TAPS), 0))
      )
      streak = streak.add(float(streakTap.g).mul(STREAK[index] as number))
    }
    const center = input.sample(sourceUv)
    return vec4(
      halo.div(GAUSSIAN_SUM),
      streak.div(STREAK_SUM),
      float(center.b),
      float(1)
    )
  }

  private buildVerticalNode(input: Node): Node {
    const sourceUv = renderTargetUv()
    let halo: Node = float(0)
    let streak: Node = float(0)
    for (let index = 0; index <= TAPS * 2; index += 1) {
      const offset = index - TAPS
      const haloTap = input.sample(
        sourceUv.add(vec2(0, this.haloStepUniform.y.mul(offset)))
      )
      halo = halo.add(float(haloTap.r).mul(GAUSSIAN[index] as number))
    }
    for (let index = 0; index <= STREAK_TAPS * 2; index += 1) {
      const streakTap = input.sample(
        sourceUv.add(vec2(0, this.flareStepUniform.y.mul(index - STREAK_TAPS)))
      )
      streak = streak.add(float(streakTap.b).mul(STREAK[index] as number))
    }
    const center = input.sample(sourceUv)
    return vec4(
      halo.div(GAUSSIAN_SUM),
      float(center.g),
      streak.div(STREAK_SUM),
      float(1)
    )
  }

  private buildSmoothNode(input: Node, horizontal: boolean): Node {
    const sourceUv = renderTargetUv()
    let halo: Node = float(0)
    for (let index = 0; index <= TAPS * 2; index += 1) {
      const offset = index - TAPS
      const step = horizontal
        ? vec2(this.haloStepUniform.x.mul(offset), 0)
        : vec2(0, this.haloStepUniform.y.mul(offset))
      halo = halo.add(
        float(input.sample(sourceUv.add(step)).r).mul(GAUSSIAN[index] as number)
      )
    }
    const center = input.sample(sourceUv)
    return vec4(halo.div(GAUSSIAN_SUM), float(center.g), float(center.b), float(1))
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.outputHeight = Math.max(1, height)
    this.syncTargets()
  }

  private syncTargets(): void {
    const documentPixel = this.outputWidth / this.logicalWidth
    const divisor = Math.min(
      MAX_DIVISOR,
      Math.max(MIN_DIVISOR, Math.round((this.spread * documentPixel) / 10))
    )
    this.fieldWidth = Math.max(1, Math.floor(this.outputWidth / divisor))
    this.fieldHeight = Math.max(1, Math.floor(this.outputHeight / divisor))
    for (const target of [
      this.maskTarget,
      this.horizontalTarget,
      this.fieldTarget,
      this.smoothTarget,
    ]) {
      target.setSize(this.fieldWidth, this.fieldHeight)
    }
    ;(this.inputTexelUniform.value as THREE.Vector2).set(
      divisor / 4 / this.outputWidth,
      divisor / 4 / this.outputHeight
    )
    this.syncSteps()
  }

  override updateLogicalSize(width: number, _height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.syncTargets()
  }

  private syncSteps(): void {
    const fieldPerDocument = this.fieldWidth / this.logicalWidth
    const haloTexels = (this.spread * Math.SQRT1_2 * fieldPerDocument * 3) / TAPS
    const flareTexels = (this.flareLength * fieldPerDocument) / STREAK_TAPS
    ;(this.haloStepUniform.value as THREE.Vector2).set(
      haloTexels / this.fieldWidth,
      haloTexels / this.fieldHeight
    )
    ;(this.flareStepUniform.value as THREE.Vector2).set(
      flareTexels / this.fieldWidth,
      flareTexels / this.fieldHeight
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.glowFromUniform.value = GLOW_MODES[String(params.glowFrom)] ?? GLOW_DARK
    this.thresholdUniform.value = readNumber(params.threshold, 0.5, 0, 1)
    const spread = readNumber(params.spread, 40, 1, 400)
    const spreadChanged = spread !== this.spread
    this.spread = spread
    this.intensityUniform.value = readNumber(params.intensity, 1.6, 0.1, 6)
    this.reachUniform.value = readNumber(params.reach, 0.08, 0.001, 1)
    this.bandsUniform.value = Math.round(readNumber(params.bands, 0, 0, 24))
    this.keepShapeUniform.value = params.keepShape === false ? 0 : 1
    this.amountUniform.value = readNumber(params.amount, 1, 0, 1)
    this.flareUniform.value = readNumber(params.flare, 0, 0, 4)
    this.flareLength = readNumber(params.flareLength, 160, 4, 800)
    this.flareThresholdUniform.value = readNumber(params.flareThreshold, 0.8, 0, 1)
    ;(this.flareColorUniform.value as THREE.Color).set(
      typeof params.flareColor === "string" ? params.flareColor : "#ff7a3d"
    )
    const stops =
      typeof params.stops === "string" && params.stops.trim() !== ""
        ? parseGradientMapStops(params.stops)
        : DEFAULT_COLOR_HALOS_STOPS
    const key = serializeGradientMapStops(stops)
    if (key !== this.stopsKey) {
      this.stopsKey = key
      ;(this.lut.image.data as Float32Array).set(buildLinearColorMap(stops))
      this.lut.needsUpdate = true
    }
    if (spreadChanged) this.syncTargets()
    else this.syncSteps()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.maskStage.input.value = inputTexture
    renderer.setRenderTarget(this.maskTarget)
    renderer.render(this.maskStage.scene, this.stageCamera)
    this.horizontalStage.input.value = this.maskTarget.texture
    renderer.setRenderTarget(this.horizontalTarget)
    renderer.render(this.horizontalStage.scene, this.stageCamera)
    this.verticalStage.input.value = this.horizontalTarget.texture
    renderer.setRenderTarget(this.fieldTarget)
    renderer.render(this.verticalStage.scene, this.stageCamera)
    this.smoothHorizontalStage.input.value = this.fieldTarget.texture
    renderer.setRenderTarget(this.horizontalTarget)
    renderer.render(this.smoothHorizontalStage.scene, this.stageCamera)
    this.smoothVerticalStage.input.value = this.horizontalTarget.texture
    renderer.setRenderTarget(this.smoothTarget)
    renderer.render(this.smoothVerticalStage.scene, this.stageCamera)
    if (this.fieldNode) this.fieldNode.value = this.smoothTarget.texture
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override buildEffectNode(): Node {
    if (!this.lut) {
      return this.inputNode
    }
    const targetUv = renderTargetUv()
    const field = tslTexture(this.placeholder, targetUv)
    this.fieldNode = field
    const color = tslTexture(this.placeholder, targetUv)
    this.colorNode = color
    const source = vec3(color.r, color.g, color.b)
    const sourceAlpha = clamp(float(color.a), 0, 1)

    const raw = clamp(float(field.r).mul(this.intensityUniform), 0, 1)
    const bands = this.bandsUniform
    const scaled = raw.mul(bands)
    const edge = max(fwidth(scaled), float(0.0001))
    const stepped = floor(scaled).add(
      smoothstep(float(0.5).sub(edge), float(0.5).add(edge), fract(scaled))
    )
    const banded = select(
      bands.greaterThan(0.5),
      clamp(stepped.div(max(bands, float(1))), 0, 1),
      raw
    )
    const mapped = tslTexture(this.lut, vec2(banded, float(0.5))).level(0)
    const haloAlpha = select(
      bands.greaterThan(0.5),
      smoothstep(float(0), float(0.5).div(max(bands, float(1))), banded),
      smoothstep(float(0), this.reachUniform, raw)
    ).mul(this.amountUniform)
    const haloRgb = vec3(mapped.r, mapped.g, mapped.b)
    const coverage = max(sourceAlpha, haloAlpha)
    const premultiplied = mix(source.mul(sourceAlpha), haloRgb, haloAlpha)
    let result: Node = premultiplied.div(max(coverage, float(0.0001)))
    const shape = smoothstep(0.35, 0.65, this.glowMask(color)).mul(
      this.keepShapeUniform
    )
    result = mix(result, source, shape)
    const flare = float(1)
      .sub(exp(float(field.g).add(field.b).mul(-24)))
      .mul(this.flareUniform)
    result = mix(result, vec3(this.flareColorUniform), clamp(flare, 0, 1)).add(
      vec3(max(flare.sub(1), float(0)).mul(0.5))
    )
    return vec4(result, max(coverage, clamp(flare, 0, 1)))
  }

  override dispose(): void {
    for (const target of [
      this.maskTarget,
      this.horizontalTarget,
      this.fieldTarget,
      this.smoothTarget,
    ]) {
      target.dispose()
    }
    for (const stage of [
      this.maskStage,
      this.horizontalStage,
      this.verticalStage,
      this.smoothHorizontalStage,
      this.smoothVerticalStage,
    ]) {
      stage.material.dispose()
      stage.scene.clear()
    }
    this.geometry.dispose()
    this.lut.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
