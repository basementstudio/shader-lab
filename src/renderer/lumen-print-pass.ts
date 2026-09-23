import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  pow,
  select,
  sin,
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
  DEFAULT_LUMEN_PRINT_STOPS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const TAP_COUNT = 16
const GOLDEN_ANGLE = 2.399963229728653
const TAPS = Array.from({ length: TAP_COUNT }, (_, index) => {
  const radius = Math.sqrt((index + 0.5) / TAP_COUNT)
  const angle = index * GOLDEN_ANGLE
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const
})

function hash(p: Node): Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031))
  const shifted = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(shifted.x.add(shifted.y).mul(shifted.z))
}

function valueNoise(p: Node): Node {
  const cell = floor(p)
  const local = fract(p)
  const eased = local.mul(local).mul(float(3).sub(local.mul(2)))
  const a = hash(cell)
  const b = hash(cell.add(vec2(1, 0)))
  const c = hash(cell.add(vec2(0, 1)))
  const d = hash(cell.add(vec2(1, 1)))
  return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y)
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

export class LumenPrintPass extends PassNode {
  private readonly amountUniform: Node
  private readonly exposureUniform: Node
  private readonly contrastUniform: Node
  private readonly solarizeUniform: Node
  private readonly pivotUniform: Node
  private readonly edgeLinesUniform: Node
  private readonly diffusionUniform: Node
  private readonly halationUniform: Node
  private readonly radiusUniform: Node
  private readonly washoutUniform: Node
  private readonly raggedUniform: Node
  private readonly edgeBurnUniform: Node
  private readonly grainUniform: Node
  private readonly grainSizeUniform: Node
  private readonly seedUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly lut: THREE.DataTexture
  private readonly placeholder = new THREE.Texture()
  private sourceTextureNodes: Node[] = []
  private stopsKey = ""

  constructor(layerId: string) {
    super(layerId)
    this.amountUniform = uniform(1)
    this.exposureUniform = uniform(0)
    this.contrastUniform = uniform(1)
    this.solarizeUniform = uniform(0)
    this.pivotUniform = uniform(0.5)
    this.edgeLinesUniform = uniform(0)
    this.diffusionUniform = uniform(0)
    this.halationUniform = uniform(0)
    this.radiusUniform = uniform(12)
    this.washoutUniform = uniform(0)
    this.raggedUniform = uniform(0.5)
    this.edgeBurnUniform = uniform(0)
    this.grainUniform = uniform(0)
    this.grainSizeUniform = uniform(1.5)
    this.seedUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
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
    this.updateParams({})
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.amountUniform.value = readNumber(params.amount, 1, 0, 1)
    this.exposureUniform.value = readNumber(params.exposure, 0, -1, 1)
    this.contrastUniform.value = readNumber(params.contrast, 1, 0, 3)
    this.solarizeUniform.value = readNumber(params.solarize, 0, 0, 1)
    this.pivotUniform.value = readNumber(params.pivot, 0.5, 0, 1)
    this.edgeLinesUniform.value = readNumber(params.edgeLines, 0, 0, 2)
    this.diffusionUniform.value = readNumber(params.diffusion, 0, 0, 1)
    this.halationUniform.value = readNumber(params.halation, 0, 0, 2)
    this.radiusUniform.value = readNumber(params.radius, 12, 1, 96)
    this.washoutUniform.value = readNumber(params.washout, 0, 0, 1)
    this.raggedUniform.value = readNumber(params.ragged, 0.5, 0, 1)
    this.edgeBurnUniform.value = readNumber(params.edgeBurn, 0, 0, 1)
    this.grainUniform.value = readNumber(params.grain, 0, 0, 1)
    this.grainSizeUniform.value = readNumber(params.grainSize, 1.5, 0.5, 8)
    this.seedUniform.value = readNumber(params.seed, 0, 0, 9999)
    const stops =
      typeof params.stops === "string" && params.stops.trim() !== ""
        ? parseGradientMapStops(params.stops)
        : DEFAULT_LUMEN_PRINT_STOPS
    const key = serializeGradientMapStops(stops)
    if (key !== this.stopsKey) {
      this.stopsKey = key
      ;(this.lut.image.data as Float32Array).set(buildLinearColorMap(stops))
      this.lut.needsUpdate = true
    }
  }

  private sample(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.lut) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const targetUv = vec2(uv().x, float(1).sub(uv().y))
    const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
    const texel = vec2(float(1).div(size.x), float(1).div(size.y))
    const pixel = targetUv.mul(size)
    const seedOffset = vec2(this.seedUniform.mul(17.13), this.seedUniform.mul(-9.71))

    const center = this.sample(targetUv)
    const source = vec3(float(center.r), float(center.g), float(center.b))
    const centerTone = perceptualLuma(center)

    const jitter = hash(pixel.add(seedOffset).add(3.7)).mul(6.2831853)
    const jitterCos = cos(jitter)
    const jitterSin = sin(jitter)
    let blurred: Node = centerTone
    let bright: Node = smoothstep(0.6, 1, centerTone).mul(centerTone)
    for (const [x, y] of TAPS) {
      const rotated = vec2(
        jitterCos.mul(x).sub(jitterSin.mul(y)),
        jitterSin.mul(x).add(jitterCos.mul(y))
      )
      const tone = perceptualLuma(
        this.sample(targetUv.add(rotated.mul(texel).mul(this.radiusUniform)))
      )
      blurred = blurred.add(tone)
      bright = bright.add(smoothstep(0.6, 1, tone).mul(tone))
    }
    blurred = blurred.div(TAP_COUNT + 1)
    bright = bright.div(TAP_COUNT + 1)

    const edgeStep = texel.mul(1.25)
    const left = perceptualLuma(this.sample(targetUv.sub(vec2(edgeStep.x, 0))))
    const right = perceptualLuma(this.sample(targetUv.add(vec2(edgeStep.x, 0))))
    const up = perceptualLuma(this.sample(targetUv.sub(vec2(0, edgeStep.y))))
    const down = perceptualLuma(this.sample(targetUv.add(vec2(0, edgeStep.y))))
    const gradient = vec2(right.sub(left), down.sub(up)).length()

    let tone: Node = mix(centerTone, blurred, this.diffusionUniform)
    tone = tone.sub(0.5).mul(this.contrastUniform).add(0.5).add(this.exposureUniform)
    tone = clamp(tone, 0, 1)

    const pivot = this.pivotUniform
    const folded = float(1).sub(
      abs(tone.sub(pivot)).div(max(max(pivot, float(1).sub(pivot)), float(0.0001)))
    )
    tone = mix(tone, folded, this.solarizeUniform)

    const line = smoothstep(0.03, 0.22, gradient).mul(this.edgeLinesUniform)
    tone = tone.add(float(1).sub(tone).mul(min(line, float(1))))
    tone = tone.add(bright.mul(this.halationUniform))

    const coarse = valueNoise(pixel.div(7).add(seedOffset))
      .mul(0.65)
      .add(valueNoise(pixel.div(2.2).add(seedOffset.mul(1.7))).mul(0.35))
    const washThreshold = float(1).sub(this.washoutUniform.mul(0.85))
    const washed = smoothstep(
      washThreshold.sub(0.05),
      washThreshold.add(0.05),
      tone.add(coarse.sub(0.5).mul(this.raggedUniform).mul(0.6))
    ).mul(min(this.washoutUniform.mul(20), float(1)))
    tone = mix(tone, float(1), washed)

    const shortSide = min(size.x, size.y)
    const edgeDistance = min(
      min(pixel.x, size.x.sub(pixel.x)),
      min(pixel.y, size.y.sub(pixel.y))
    ).div(shortSide)
    const wobble = valueNoise(pixel.div(shortSide).mul(9).add(seedOffset)).mul(0.12)
    const burn = float(1)
      .sub(smoothstep(0, float(0.1).add(wobble), edgeDistance))
      .mul(this.edgeBurnUniform)
    tone = tone.mul(float(1).sub(burn.mul(0.85)))

    const grainCoord = pixel.div(this.grainSizeUniform).add(seedOffset.mul(3.1))
    const grain = valueNoise(grainCoord)
      .mul(0.6)
      .add(hash(floor(grainCoord.mul(1.9))).mul(0.4))
      .sub(0.5)
    const midtones = float(0.35).add(tone.mul(float(1).sub(tone)).mul(2.6))
    tone = clamp(tone.add(grain.mul(this.grainUniform).mul(midtones)), 0, 1)

    const mapped = tslTexture(this.lut, vec2(tone, float(0.5))).level(0)
    return vec4(
      mix(source, vec3(mapped.r, mapped.g, mapped.b), this.amountUniform),
      float(1)
    )
  }

  override dispose(): void {
    this.lut.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
