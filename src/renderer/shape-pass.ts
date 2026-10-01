import {
  abs,
  atan,
  clamp,
  cos,
  float,
  Fn,
  If,
  length,
  max,
  min,
  mod,
  PI,
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
import { parseSvgPalette, serializeSvgPalette } from "@/renderer/svg-palette"
import { buildSvgShapeField, type SvgShapeField } from "@/renderer/svg-shape-field"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

export const SHAPE_KINDS = [
  "ellipse",
  "rectangle",
  "triangle",
  "polygon",
  "star",
  "ring",
  "blades",
  "svg",
] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

function number(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

export class ShapePass extends PassNode {
  private readonly shape = uniform(0)
  private readonly center = uniform(new THREE.Vector2(0, 0))
  private readonly size = uniform(new THREE.Vector2(0.6, 0.6))
  private readonly rotation = uniform(0)
  private readonly color = uniform(new THREE.Color("#ff4a2a"))
  private readonly softness = uniform(0)
  private readonly outline = uniform(0)
  private readonly cornerRadius = uniform(0.1)
  private readonly sides = uniform(6)
  private readonly points = uniform(5)
  private readonly innerRadius = uniform(0.45)
  private readonly thickness = uniform(0.3)
  private readonly blades = uniform(4)
  private readonly twist = uniform(0.6)
  private readonly bladeWidth = uniform(0.7)
  private readonly hub = uniform(0.12)
  private readonly aspect = uniform(new THREE.Vector2(1, 1))
  private readonly pixel = uniform(1 / 1080)
  private readonly svgActive = uniform(0)
  private readonly svgOriginal = uniform(1)
  private readonly svgTextureSize = uniform(new THREE.Vector2(1, 1))
  private readonly svgContentOffset = uniform(new THREE.Vector2(0, 0))
  private readonly svgContentScale = uniform(new THREE.Vector2(1, 1))
  private readonly svgContentTexels = uniform(new THREE.Vector2(1, 1))
  private readonly svgDistancePlaceholder = new THREE.DataTexture(
    new Uint16Array([0]),
    1,
    1,
    THREE.RedFormat,
    THREE.HalfFloatType
  )
  private readonly svgColorPlaceholder = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    THREE.RGBAFormat
  )
  private svgDistanceNode: Node | null = null
  private svgColorNode: Node | null = null
  private svgField: SvgShapeField | null = null
  private readonly retiredFields: { field: SvgShapeField; frames: number }[] = []
  private svgUrl: string | null = null
  private svgText: string | null = null
  private svgPalette = ""
  private svgRequest = 0
  private svgPending = false
  private svgRebuild: Promise<void> = Promise.resolve()

  constructor(layerId: string) {
    super(layerId)
    this.rebuildEffectNode()
  }

  override updateLogicalSize(width: number, height: number): void {
    const shorter = Math.max(1, Math.min(width, height))
    ;(this.aspect.value as THREE.Vector2).set(
      Math.max(1, width) / shorter,
      Math.max(1, height) / shorter
    )
  }

  override resize(width: number, height: number): void {
    this.pixel.value = 1 / Math.max(1, Math.min(width, height))
  }

  override updateParams(params: LayerParameterValues): void {
    const index = SHAPE_KINDS.indexOf(params.shape as ShapeKind)
    this.shape.value = index === -1 ? 0 : index
    const center = Array.isArray(params.center) ? params.center : [0, 0]
    ;(this.center.value as THREE.Vector2).set(
      number(center[0], 0, -4, 4),
      number(center[1], 0, -4, 4)
    )
    const size = Array.isArray(params.size) ? params.size : [0.6, 0.6]
    ;(this.size.value as THREE.Vector2).set(
      number(size[0], 0.6, 0.001, 8),
      number(size[1], 0.6, 0.001, 8)
    )
    this.rotation.value = (number(params.rotation, 0, -720, 720) * Math.PI) / 180
    ;(this.color.value as THREE.Color).set(
      typeof params.color === "string" ? params.color : "#ff4a2a"
    )
    this.softness.value = number(params.softness, 0, 0, 1)
    this.outline.value = number(params.outline, 0, 0, 1)
    this.cornerRadius.value = number(params.cornerRadius, 0.1, 0, 1)
    this.sides.value = Math.round(number(params.sides, 6, 3, 24))
    this.points.value = Math.round(number(params.points, 5, 3, 24))
    this.innerRadius.value = number(params.innerRadius, 0.45, 0.05, 0.95)
    this.thickness.value = number(params.thickness, 0.3, 0.01, 1)
    this.blades.value = Math.round(number(params.blades, 4, 2, 12))
    this.twist.value = number(params.twist, 0.6, -4, 4)
    this.bladeWidth.value = number(params.bladeWidth, 0.7, 0.05, 1)
    this.hub.value = number(params.hub, 0.12, 0, 0.9)
    this.svgOriginal.value = params.svgColorMode === "single" ? 0 : 1
    const palette = serializeSvgPalette(parseSvgPalette(params.svgPalette))
    if (palette !== this.svgPalette) {
      this.svgPalette = palette
      if (this.svgText !== null) {
        this.svgRebuild = this.rebuildSvgField(this.svgText)
        void this.svgRebuild.catch(() => undefined)
      }
    }
  }

  setSvg(url: string | null): Promise<void> {
    if (url === this.svgUrl) {
      return this.svgRebuild
    }
    this.svgUrl = url
    this.svgText = null
    if (url === null) {
      this.svgRequest += 1
      this.svgPending = false
      this.installSvgField(null)
      this.svgRebuild = Promise.resolve()
      return this.svgRebuild
    }
    const request = ++this.svgRequest
    this.svgPending = true
    this.svgRebuild = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load SVG: ${response.status}`)
        return response.text()
      })
      .then((text) => {
        if (request !== this.svgRequest) return
        this.svgText = text
        return this.rebuildSvgField(text)
      })
      .catch((error: unknown) => {
        if (request === this.svgRequest) {
          this.svgPending = false
          this.svgUrl = null
          this.svgText = null
          this.installSvgField(null)
        }
        throw error
      })
    return this.svgRebuild
  }

  isSvgPending(): boolean {
    return this.svgPending
  }

  override needsContinuousRender(): boolean {
    return this.svgPending
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (let index = this.retiredFields.length - 1; index >= 0; index -= 1) {
      const retired = this.retiredFields[index]!
      retired.frames += 1
      if (retired.frames > 3) {
        if (retired.field.distance !== this.svgField?.distance) {
          retired.field.distance.dispose()
        }
        retired.field.color.dispose()
        this.retiredFields.splice(index, 1)
      }
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override dispose(): void {
    this.svgRequest += 1
    for (const retired of this.retiredFields) {
      retired.field.distance.dispose()
      retired.field.color.dispose()
    }
    this.retiredFields.length = 0
    this.svgField?.distance.dispose()
    this.svgField?.color.dispose()
    this.svgField = null
    this.svgDistancePlaceholder.dispose()
    this.svgColorPlaceholder.dispose()
    super.dispose()
  }

  private async rebuildSvgField(text: string): Promise<void> {
    const request = ++this.svgRequest
    this.svgPending = true
    try {
      const field = await buildSvgShapeField(
        text,
        parseSvgPalette(this.svgPalette),
        this.svgField
      )
      if (request !== this.svgRequest) {
        if (field.distance !== this.svgField?.distance) field.distance.dispose()
        field.color.dispose()
        return
      }
      this.installSvgField(field)
    } finally {
      if (request === this.svgRequest) this.svgPending = false
    }
  }

  private installSvgField(field: SvgShapeField | null): void {
    if (this.svgField) {
      this.retiredFields.push({ field: this.svgField, frames: 0 })
    }
    this.svgField = field
    if (this.svgDistanceNode) {
      this.svgDistanceNode.value = field?.distance ?? this.svgDistancePlaceholder
    }
    if (this.svgColorNode) {
      this.svgColorNode.value = field?.color ?? this.svgColorPlaceholder
    }
    this.svgActive.value = field ? 1 : 0
    if (!field) return
    ;(this.svgTextureSize.value as THREE.Vector2).set(field.width, field.height)
    ;(this.svgContentOffset.value as THREE.Vector2).set(
      (field.width - field.contentWidth) / 2 / field.width,
      (field.height - field.contentHeight) / 2 / field.height
    )
    ;(this.svgContentScale.value as THREE.Vector2).set(
      field.contentWidth / field.width,
      field.contentHeight / field.height
    )
    ;(this.svgContentTexels.value as THREE.Vector2).set(
      field.contentWidth,
      field.contentHeight
    )
  }

  protected override buildEffectNode(): Node {
    if (!(this.aspect && this.svgDistancePlaceholder)) {
      return this.inputNode
    }
    const svgDistanceNode = tslTexture(
      this.svgField?.distance ?? this.svgDistancePlaceholder,
      vec2(0)
    )
    const svgColorNode = tslTexture(
      this.svgField?.color ?? this.svgColorPlaceholder,
      vec2(0)
    )
    this.svgDistanceNode = svgDistanceNode
    this.svgColorNode = svgColorNode
    return Fn(() => {
      const screen = vec2(uv().x, float(1).sub(uv().y))
      const point = screen.sub(0.5).mul(this.aspect).sub(this.center)
      const c = cos(this.rotation)
      const s = sin(this.rotation)
      const q = vec2(
        point.x.mul(c).add(point.y.mul(s)),
        point.y.mul(c).sub(point.x.mul(s))
      )
      const half = this.size.mul(0.5)
      const unit = min(half.x, half.y)
      const u = q.div(half)
      const radius = length(u).toVar()
      const atan2 = (y: Node, x: Node) => {
        const base = atan(y.div(x))
        const wrap = select(y.greaterThanEqual(0), PI, PI.negate())
        return select(x.greaterThanEqual(0), base, base.add(wrap))
      }
      const angle = () => atan2(u.x, u.y.negate())

      const polygonRadius = (theta: Node, n: Node) => {
        const sector = float(2).mul(PI).div(n)
        const halfSector = PI.div(n)
        const local = mod(theta, sector).sub(halfSector)
        return cos(halfSector).div(cos(local))
      }

      const kind = this.shape
      const distance = radius.sub(1).mul(unit).toVar()
      If(kind.equal(float(1)), () => {
        const cornerUnits = this.cornerRadius.mul(unit)
        const boxDistance = abs(q).sub(half).add(cornerUnits)
        distance.assign(
          length(max(boxDistance, vec2(0)))
            .add(min(max(boxDistance.x, boxDistance.y), float(0)))
            .sub(cornerUnits)
        )
      })
      If(kind.equal(float(2)), () => {
        distance.assign(radius.sub(polygonRadius(angle(), float(3))).mul(unit))
      })
      If(kind.equal(float(3)), () => {
        distance.assign(radius.sub(polygonRadius(angle(), this.sides)).mul(unit))
      })
      If(kind.equal(float(4)), () => {
        const theta = angle()
        const starSector = float(2).mul(PI).div(this.points)
        const starT = abs(
          mod(theta.add(starSector.mul(0.5)), starSector).sub(starSector.mul(0.5))
        ).div(starSector.mul(0.5))
        const starRadius = float(1).sub(float(1).sub(this.innerRadius).mul(starT))
        distance.assign(radius.sub(starRadius).mul(unit))
      })
      If(kind.equal(float(5)), () => {
        const ringHalf = this.thickness.mul(0.5)
        distance.assign(
          abs(radius.sub(float(1).sub(ringHalf))).sub(ringHalf).mul(unit)
        )
      })
      If(kind.equal(float(6)), () => {
        const bladeAngle = angle().add(this.twist.mul(radius))
        const lobe = max(cos(this.blades.mul(bladeAngle)), float(0))
        const sharpness = float(6).sub(this.bladeWidth.mul(5.5))
        const bladeRadius = this.hub.add(
          float(1).sub(this.hub).mul(pow(lobe, sharpness))
        )
        distance.assign(radius.sub(bladeRadius).mul(unit))
      })

      const svgColor = vec3(this.color).toVar()
      const svgAlpha = float(1).toVar()
      If(kind.equal(float(7)), () => {
        distance.assign(float(1000))
        If(this.svgActive.greaterThan(float(0.5)), () => {
          const textureUv = this.svgContentOffset.add(
            u.mul(0.5).add(0.5).mul(this.svgContentScale)
          )
          const halfTexel = vec2(0.5).div(this.svgTextureSize)
          const clamped = clamp(textureUv, halfTexel, vec2(1).sub(halfTexel))
          const texelUnits = vec2(
            half.x.mul(2).div(this.svgContentTexels.x),
            half.y.mul(2).div(this.svgContentTexels.y)
          )
          const beyond = length(textureUv.sub(clamped).mul(this.svgTextureSize))
          const sampled = float(svgDistanceNode.sample(clamped).level(0).r)
          const step = vec2(1).div(this.svgTextureSize)
          const gradient = vec2(
            float(svgDistanceNode.sample(clamped.add(vec2(step.x, 0))).level(0).r).sub(
              float(svgDistanceNode.sample(clamped.sub(vec2(step.x, 0))).level(0).r)
            ),
            float(svgDistanceNode.sample(clamped.add(vec2(0, step.y))).level(0).r).sub(
              float(svgDistanceNode.sample(clamped.sub(vec2(0, step.y))).level(0).r)
            )
          )
          const direction = gradient.div(max(length(gradient), float(0.0001)))
          const unitsPerTexel = select(
            length(gradient).greaterThan(float(0.0001)),
            length(direction.mul(texelUnits)),
            min(texelUnits.x, texelUnits.y)
          )
          distance.assign(sampled.add(beyond).mul(unitsPerTexel))
          const colorSample = svgColorNode.sample(clamped).level(0)
          svgColor.assign(vec3(colorSample.rgb))
          svgAlpha.assign(float(colorSample.a))
        })
      })

      const outlined = select(
        this.outline.greaterThan(float(0)),
        abs(distance).sub(this.outline.mul(0.5)),
        distance
      )
      const edge = max(this.softness, this.pixel.mul(0.75))
      const coverage = float(1).sub(smoothstep(edge.negate(), edge, outlined))
      const keepsSvgColor = kind
        .equal(float(7))
        .and(this.svgOriginal.greaterThan(float(0.5)))
        .and(this.outline.lessThanEqual(float(0)))
      const fill = select(keepsSvgColor, svgColor, vec3(this.color))
      const opacity = select(keepsSvgColor, svgAlpha, float(1))
      return vec4(fill, clamp(coverage.mul(opacity), 0, 1))
    })()
  }
}
