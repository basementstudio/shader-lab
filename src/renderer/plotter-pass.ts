import {
  abs,
  clamp,
  cos,
  dot,
  float,
  fract,
  mix,
  select,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const COLOR_MODE_INK = 0
const COLOR_MODE_SOURCE = 1

function toColorModeValue(value: unknown): number {
  return value === "source" ? COLOR_MODE_SOURCE : COLOR_MODE_INK
}

function parseHexColor(
  hex: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (typeof hex !== "string" || !hex.startsWith("#") || hex.length < 7) {
    return fallback
  }

  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return fallback
  }

  return [r, g, b]
}

export class PlotterPass extends PassNode {
  private readonly colorModeUniform: Node
  private readonly gapUniform: Node
  private readonly weightUniform: Node
  private readonly angleUniform: Node
  private readonly crosshatchUniform: Node
  private readonly crossAngleUniform: Node
  private readonly thresholdUniform: Node
  private readonly wobbleUniform: Node
  private readonly paperColorRUniform: Node
  private readonly paperColorGUniform: Node
  private readonly paperColorBUniform: Node
  private readonly inkColorRUniform: Node
  private readonly inkColorGUniform: Node
  private readonly inkColorBUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node

  constructor(layerId: string) {
    super(layerId)
    this.colorModeUniform = uniform(COLOR_MODE_INK)
    this.gapUniform = uniform(12)
    this.weightUniform = uniform(1.5)
    this.angleUniform = uniform(90)
    this.crosshatchUniform = uniform(1)
    this.crossAngleUniform = uniform(135)
    this.thresholdUniform = uniform(0.5)
    this.wobbleUniform = uniform(0.3)
    this.paperColorRUniform = uniform(0.96)
    this.paperColorGUniform = uniform(0.94)
    this.paperColorBUniform = uniform(0.91)
    this.inkColorRUniform = uniform(0.1)
    this.inkColorGUniform = uniform(0.1)
    this.inkColorBUniform = uniform(0.1)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override resize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.colorModeUniform.value = toColorModeValue(params.colorMode)
    this.gapUniform.value =
      typeof params.gap === "number"
        ? Math.max(10, Math.min(120, params.gap))
        : 12
    this.weightUniform.value =
      typeof params.weight === "number"
        ? Math.max(0.5, Math.min(5, params.weight))
        : 1.5
    this.angleUniform.value =
      typeof params.angle === "number"
        ? Math.max(0, Math.min(180, params.angle))
        : 90
    this.crosshatchUniform.value =
      typeof params.crosshatch === "boolean" && params.crosshatch === false
        ? 0
        : 1
    this.crossAngleUniform.value =
      typeof params.crossAngle === "number"
        ? Math.max(0, Math.min(180, params.crossAngle))
        : 135
    this.thresholdUniform.value =
      typeof params.threshold === "number"
        ? Math.max(0, Math.min(1, params.threshold))
        : 0.5
    this.wobbleUniform.value =
      typeof params.wobble === "number"
        ? Math.max(0, Math.min(1, params.wobble))
        : 0.3

    const [pr, pg, pb] = parseHexColor(params.paperColor, [0.96, 0.94, 0.91])
    this.paperColorRUniform.value = pr
    this.paperColorGUniform.value = pg
    this.paperColorBUniform.value = pb

    const [ir, ig, ib] = parseHexColor(params.inkColor, [0.1, 0.1, 0.1])
    this.inkColorRUniform.value = ir
    this.inkColorGUniform.value = ig
    this.inkColorBUniform.value = ib
  }

  private buildHatchLine(
    pixelCoord: Node,
    angleUniform: Node,
    luma: Node
  ): Node {
    const angleRadians = angleUniform.mul(Math.PI / 180)
    const cosA = cos(angleRadians)
    const sinA = sin(angleRadians)

    const rotX = pixelCoord.x.mul(cosA).add(pixelCoord.y.mul(sinA))
    const rotY = pixelCoord.x.mul(sinA.negate()).add(pixelCoord.y.mul(cosA))

    const wobbleOffset = sin(rotY.mul(float(0.08)))
      .mul(this.wobbleUniform)
      .mul(float(1.5))
    const rotXWobbled = rotX.add(wobbleOffset)

    const cellPos = fract(rotXWobbled.div(this.gapUniform))
    const distFromCenter = abs(cellPos.sub(float(0.5))).mul(float(2))

    const darkness = float(1).sub(luma)
    const effectiveThreshold = darkness.mul(this.thresholdUniform.mul(float(2)))
    const lineWidth = this.weightUniform
      .div(this.gapUniform)
      .mul(effectiveThreshold)

    return float(1).sub(
      smoothstep(
        lineWidth.sub(float(0.02)),
        lineWidth.add(float(0.02)),
        distFromCenter
      )
    )
  }

  protected override buildEffectNode(): Node {
    if (!this.gapUniform) {
      return this.inputNode
    }

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const pixelCoord = vec2(
      renderTargetUv.x.mul(this.widthUniform),
      renderTargetUv.y.mul(this.heightUniform)
    )

    const sourceColor = vec3(
      float(this.inputNode.r),
      float(this.inputNode.g),
      float(this.inputNode.b)
    )
    const luma = dot(sourceColor, vec3(0.2126, 0.7152, 0.0722))

    const hatch1 = this.buildHatchLine(pixelCoord, this.angleUniform, luma)
    const hatch2 = this.buildHatchLine(pixelCoord, this.crossAngleUniform, luma)
    const crosshatchActive = this.crosshatchUniform.greaterThan(float(0.5))

    const combinedHatch = mix(
      hatch1,
      clamp(hatch1.add(hatch2), float(0), float(1)),
      crosshatchActive
    )

    const paperColor = vec3(
      this.paperColorRUniform,
      this.paperColorGUniform,
      this.paperColorBUniform
    )
    const inkColor = vec3(
      this.inkColorRUniform,
      this.inkColorGUniform,
      this.inkColorBUniform
    )

    const isSourceMode = this.colorModeUniform.greaterThan(float(0.5))
    const lineColor = vec3(
      select(isSourceMode, sourceColor.x, inkColor.x),
      select(isSourceMode, sourceColor.y, inkColor.y),
      select(isSourceMode, sourceColor.z, inkColor.z)
    )

    const result = mix(paperColor, lineColor, combinedHatch)

    return vec4(result, float(1))
  }
}
