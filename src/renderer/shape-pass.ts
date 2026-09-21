import {
  abs,
  atan,
  clamp,
  cos,
  float,
  length,
  max,
  min,
  mod,
  PI,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
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
  }

  protected override buildEffectNode(): Node {
    if (!this.aspect) {
      return this.inputNode
    }
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
    const radius = length(u)
    const atan2 = (y: Node, x: Node) => {
      const base = atan(y.div(x))
      return select(x.greaterThanEqual(0), base, base.add(sign(y).mul(PI)))
    }
    const theta = atan2(u.x, u.y.negate())

    const ellipse = radius.sub(1).mul(unit)

    const cornerUnits = this.cornerRadius.mul(unit)
    const boxDistance = abs(q).sub(half).add(cornerUnits)
    const rectangle = length(max(boxDistance, vec2(0)))
      .add(min(max(boxDistance.x, boxDistance.y), float(0)))
      .sub(cornerUnits)

    const polygonRadius = (n: Node) => {
      const sector = float(2).mul(PI).div(n)
      const halfSector = PI.div(n)
      const local = mod(theta, sector).sub(halfSector)
      return cos(halfSector).div(cos(local))
    }
    const triangle = radius.sub(polygonRadius(float(3))).mul(unit)
    const polygon = radius.sub(polygonRadius(this.sides)).mul(unit)

    const starSector = float(2).mul(PI).div(this.points)
    const starT = abs(
      mod(theta.add(starSector.mul(0.5)), starSector).sub(starSector.mul(0.5))
    ).div(starSector.mul(0.5))
    const starRadius = float(1).sub(float(1).sub(this.innerRadius).mul(starT))
    const star = radius.sub(starRadius).mul(unit)

    const ringHalf = this.thickness.mul(0.5)
    const ring = abs(radius.sub(float(1).sub(ringHalf))).sub(ringHalf).mul(unit)

    const bladeAngle = theta.add(this.twist.mul(radius))
    const lobe = max(cos(this.blades.mul(bladeAngle)), float(0))
    const sharpness = float(6).sub(this.bladeWidth.mul(5.5))
    const bladeRadius = this.hub.add(
      float(1).sub(this.hub).mul(pow(lobe, sharpness))
    )
    const blades = radius.sub(bladeRadius).mul(unit)

    const kind = this.shape
    let distance: Node = ellipse
    distance = select(kind.equal(float(1)), rectangle, distance)
    distance = select(kind.equal(float(2)), triangle, distance)
    distance = select(kind.equal(float(3)), polygon, distance)
    distance = select(kind.equal(float(4)), star, distance)
    distance = select(kind.equal(float(5)), ring, distance)
    distance = select(kind.equal(float(6)), blades, distance)

    const outlined = select(
      this.outline.greaterThan(float(0)),
      abs(distance).sub(this.outline.mul(0.5)),
      distance
    )
    const edge = max(this.softness, this.pixel.mul(0.75))
    const coverage = float(1).sub(smoothstep(edge.negate(), edge, outlined))
    return vec4(this.color, clamp(coverage, 0, 1))
  }
}
