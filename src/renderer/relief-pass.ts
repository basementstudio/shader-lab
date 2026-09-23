import {
  atan,
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
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const HEIGHT_LUMINANCE = 0
const HEIGHT_DEPTH = 1
const HEIGHT_ALPHA = 2
const ENGRAVE_NONE = 0
const ENGRAVE_PARALLEL = 1
const ENGRAVE_RADIAL = 2
const HEIGHT_MODES: Record<string, number> = {
  alpha: HEIGHT_ALPHA,
  depth: HEIGHT_DEPTH,
  luminance: HEIGHT_LUMINANCE,
}
const ENGRAVE_MODES: Record<string, number> = {
  none: ENGRAVE_NONE,
  parallel: ENGRAVE_PARALLEL,
  radial: ENGRAVE_RADIAL,
}

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

export class ReliefPass extends PassNode {
  private readonly heightModeUniform: Node
  private readonly debossUniform: Node
  private readonly depthUniform: Node
  private readonly bevelUniform: Node
  private readonly lightAngleUniform: Node
  private readonly elevationUniform: Node
  private readonly ambientUniform: Node
  private readonly sourceSurfaceUniform: Node
  private readonly colorUniform: Node
  private readonly specularUniform: Node
  private readonly shininessUniform: Node
  private readonly engraveUniform: Node
  private readonly engraveDepthUniform: Node
  private readonly lineSpacingUniform: Node
  private readonly engraveAngleUniform: Node
  private readonly grainUniform: Node
  private readonly grainSizeUniform: Node
  private readonly amountUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly placeholder = new THREE.Texture()
  private heightTextureNodes: Node[] = []
  private colorTextureNode: Node | null = null

  constructor(layerId: string) {
    super(layerId)
    this.heightModeUniform = uniform(HEIGHT_LUMINANCE)
    this.debossUniform = uniform(0)
    this.depthUniform = uniform(1)
    this.bevelUniform = uniform(3)
    this.lightAngleUniform = uniform(135)
    this.elevationUniform = uniform(40)
    this.ambientUniform = uniform(0.35)
    this.sourceSurfaceUniform = uniform(0)
    this.colorUniform = uniform(new THREE.Color("#9c9ea1"))
    this.specularUniform = uniform(0.5)
    this.shininessUniform = uniform(24)
    this.engraveUniform = uniform(ENGRAVE_NONE)
    this.engraveDepthUniform = uniform(0)
    this.lineSpacingUniform = uniform(5)
    this.engraveAngleUniform = uniform(0)
    this.grainUniform = uniform(0)
    this.grainSizeUniform = uniform(1.5)
    this.amountUniform = uniform(1)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    const heightSource = this.resolveEffectSource(inputTexture)
    for (const node of this.heightTextureNodes) {
      node.value = heightSource
    }
    if (this.colorTextureNode) {
      this.colorTextureNode.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.updateSourceMode({
      input: params.heightFrom === "depth" ? "depth" : "luminance",
    })
    this.heightModeUniform.value =
      HEIGHT_MODES[String(params.heightFrom)] ?? HEIGHT_LUMINANCE
    this.debossUniform.value = params.relief === "deboss" ? 1 : 0
    this.depthUniform.value = readNumber(params.depth, 1, 0, 4)
    this.bevelUniform.value = readNumber(params.bevel, 3, 1, 32)
    this.lightAngleUniform.value = readNumber(params.lightAngle, 135, 0, 360)
    this.elevationUniform.value = readNumber(params.elevation, 40, 5, 90)
    this.ambientUniform.value = readNumber(params.ambient, 0.35, 0, 1)
    this.sourceSurfaceUniform.value = params.surface === "source" ? 1 : 0
    ;(this.colorUniform.value as THREE.Color).set(
      typeof params.color === "string" ? params.color : "#9c9ea1"
    )
    this.specularUniform.value = readNumber(params.specular, 0.5, 0, 2)
    this.shininessUniform.value = readNumber(params.shininess, 24, 1, 128)
    this.engraveUniform.value =
      ENGRAVE_MODES[String(params.engrave)] ?? ENGRAVE_NONE
    this.engraveDepthUniform.value = readNumber(params.engraveDepth, 0, 0, 2)
    this.lineSpacingUniform.value = readNumber(params.lineSpacing, 5, 2, 40)
    this.engraveAngleUniform.value = readNumber(params.engraveAngle, 0, -180, 180)
    this.grainUniform.value = readNumber(params.grain, 0, 0, 1)
    this.grainSizeUniform.value = readNumber(params.grainSize, 1.5, 0.5, 8)
    this.amountUniform.value = readNumber(params.amount, 1, 0, 1)
  }

  private heightSample(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.heightTextureNodes.push(node)
    const mode = this.heightModeUniform
    return select(
      mode.lessThan(0.5),
      perceptualLuma(node),
      select(mode.lessThan(1.5), float(node.r), float(node.a))
    )
  }

  private surfaceDetail(pixel: Node, size: Node, tone: Node): Node {
    const spacing = this.lineSpacingUniform
    const angle = this.engraveAngleUniform.mul(Math.PI / 180)
    const along = pixel.x.mul(cos(angle)).add(pixel.y.mul(sin(angle)))
    const across = pixel.y.mul(cos(angle)).sub(pixel.x.mul(sin(angle)))
    const wander = valueNoise(vec2(across.div(spacing.mul(9)), 3.1))
      .sub(0.5)
      .mul(spacing.mul(0.8))
    const parallel = cos(along.add(wander).div(spacing).mul(Math.PI * 2))
    const offset = pixel.sub(size.mul(0.5))
    const theta = atan(offset.y, offset.x)
    const radius = offset.length()
    const rays = min(size.x, size.y).mul(Math.PI * 0.5).div(spacing)
    const rayJitter = valueNoise(vec2(theta.mul(rays).div(6.2831853), radius.div(spacing.mul(14))))
      .sub(0.5)
      .mul(1.4)
    const shortSide = min(size.x, size.y)
    const radial = cos(theta.mul(rays).add(rayJitter)).mul(
      smoothstep(shortSide.mul(0.06), shortSide.mul(0.22), radius)
    )
    const mode = this.engraveUniform
    const lines = select(
      mode.lessThan(0.5),
      float(0),
      select(mode.lessThan(1.5), parallel, radial)
    )
    const cut = lines
      .mul(0.5)
      .mul(this.engraveDepthUniform)
      .mul(float(0.35).add(float(1).sub(tone).mul(0.65)))
    const grain = valueNoise(pixel.div(this.grainSizeUniform))
      .mul(0.6)
      .add(hash(floor(pixel.div(this.grainSizeUniform).mul(2.1))).mul(0.4))
      .sub(0.5)
      .mul(this.grainUniform)
    return cut.add(grain)
  }

  protected override buildEffectNode(): Node {
    if (!this.logicalHeightUniform) {
      return this.inputNode
    }

    this.heightTextureNodes = []

    const targetUv = vec2(uv().x, float(1).sub(uv().y))
    const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
    const texel = vec2(float(1).div(size.x), float(1).div(size.y))
    const pixel = targetUv.mul(size)
    const reach = texel.mul(this.bevelUniform)

    const center = this.heightSample(targetUv)
    const right = this.heightSample(targetUv.add(vec2(reach.x, 0)))
    const left = this.heightSample(targetUv.sub(vec2(reach.x, 0)))
    const down = this.heightSample(targetUv.add(vec2(0, reach.y)))
    const up = this.heightSample(targetUv.sub(vec2(0, reach.y)))

    const detailRight = this.surfaceDetail(pixel.add(vec2(1, 0)), size, center)
    const detailLeft = this.surfaceDetail(pixel.sub(vec2(1, 0)), size, center)
    const detailDown = this.surfaceDetail(pixel.add(vec2(0, 1)), size, center)
    const detailUp = this.surfaceDetail(pixel.sub(vec2(0, 1)), size, center)

    const sign = select(this.debossUniform.greaterThan(0.5), float(-1), float(1))
    const slopeX = right
      .sub(left)
      .mul(this.depthUniform)
      .mul(sign)
      .add(detailRight.sub(detailLeft))
    const slopeY = down
      .sub(up)
      .mul(this.depthUniform)
      .mul(sign)
      .add(detailDown.sub(detailUp))
    const normal = vec3(slopeX.mul(-2), slopeY.mul(2), float(1)).normalize()

    const azimuth = this.lightAngleUniform.mul(Math.PI / 180)
    const elevation = this.elevationUniform.mul(Math.PI / 180)
    const light = vec3(
      cos(azimuth).mul(cos(elevation)),
      sin(azimuth).mul(cos(elevation)),
      sin(elevation)
    ).normalize()
    const shade = max(dot(normal, light), 0).div(sin(elevation))
    const halfway = light.add(vec3(0, 0, 1)).normalize()
    const flatSpecular = pow(max(halfway.z, 0), this.shininessUniform)
    const specular = max(
      pow(max(dot(normal, halfway), 0), this.shininessUniform).sub(flatSpecular),
      0
    ).mul(this.specularUniform)

    const colorNode = tslTexture(this.placeholder, targetUv)
    this.colorTextureNode = colorNode
    const source = vec3(colorNode.r, colorNode.g, colorNode.b)
    const base = select(
      this.sourceSurfaceUniform.greaterThan(0.5),
      source,
      this.colorUniform
    )
    const ambient = this.ambientUniform
    const lit = base
      .mul(ambient.add(float(1).sub(ambient).mul(shade)))
      .add(vec3(specular))
    return vec4(
      mix(source, clamp(lit, 0, 1), this.amountUniform),
      float(1)
    )
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
