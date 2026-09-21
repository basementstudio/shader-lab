import {
  abs,
  clamp,
  cos,
  float,
  length,
  max,
  min,
  mix,
  select,
  sin,
  smoothstep,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { CELL_PAINT_SIZE, decodeCellPaintMask } from "./cell-paint-mask"

export const LAYER_MASK_SHAPES = [
  "none",
  "linear",
  "radial",
  "ellipse",
  "rectangle",
  "brush",
  "depth",
] as const
export type LayerMaskShape = (typeof LAYER_MASK_SHAPES)[number]
export const LAYER_MASK_SCOPES = ["effect", "content"] as const
export type LayerMaskScope = (typeof LAYER_MASK_SCOPES)[number]

export interface LayerMaskState {
  shape: LayerMaskShape
  scope: LayerMaskScope
  enabled: boolean
  invert: boolean
  center: [number, number]
  size: [number, number]
  rotation: number
  feather: number
  paint: string
}

export const DEFAULT_LAYER_MASK: LayerMaskState = {
  shape: "none",
  scope: "effect",
  enabled: true,
  invert: false,
  center: [0, 0],
  size: [0.5, 0.5],
  rotation: 0,
  feather: 0.01,
  paint: "",
}

const MIN_SIZE = 0.001
const MAX_SIZE = 8

function finite(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

function pair(
  value: unknown,
  fallback: [number, number],
  low: number,
  high: number
): [number, number] {
  return Array.isArray(value)
    ? [
        finite(value[0], fallback[0], low, high),
        finite(value[1], fallback[1], low, high),
      ]
    : fallback
}

export function normalizeLayerMask(value: unknown): LayerMaskState | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const shape = LAYER_MASK_SHAPES.includes(input.shape as LayerMaskShape)
    ? (input.shape as LayerMaskShape)
    : "none"
  return {
    shape,
    scope: input.scope === "content" ? "content" : "effect",
    enabled: input.enabled !== false,
    invert: input.invert === true,
    center: pair(input.center, DEFAULT_LAYER_MASK.center, -MAX_SIZE, MAX_SIZE),
    size: pair(input.size, DEFAULT_LAYER_MASK.size, MIN_SIZE, MAX_SIZE),
    rotation: finite(input.rotation, 0, -360, 360),
    feather: finite(input.feather, DEFAULT_LAYER_MASK.feather, 0, 1),
    paint: typeof input.paint === "string" ? input.paint : "",
  }
}

export function isLayerMaskActive(
  mask: LayerMaskState | null | undefined
): mask is LayerMaskState {
  return !!mask && mask.enabled && mask.shape !== "none"
}

export function layerMaskSignature(
  mask: LayerMaskState | null | undefined
): string {
  if (!isLayerMaskActive(mask)) return "mask:off"
  return [
    "mask",
    mask.shape,
    mask.scope,
    mask.invert ? "1" : "0",
    mask.center.join(","),
    mask.size.join(","),
    mask.rotation,
    mask.feather,
    mask.shape === "brush" ? mask.paint : "",
  ].join(":")
}

export type LayerMaskRole = "source" | "effect" | "transform"

export class LayerMaskNode {
  private readonly center = uniform(new THREE.Vector2(0, 0))
  private readonly size = uniform(new THREE.Vector2(0.5, 0.5))
  private readonly rotation = uniform(0)
  private readonly feather = uniform(0.01)
  private readonly aspect = uniform(new THREE.Vector2(1, 1))
  private readonly paintAspect = uniform(new THREE.Vector2(1, 1))
  private paintTexture: THREE.DataTexture | null = null
  private paintValue = ""
  private readonly depthPlaceholder = new THREE.Texture()
  private readonly depthNode = texture(
    this.depthPlaceholder,
    vec2(uv().x, float(1).sub(uv().y))
  )
  private readonly hasDepth = uniform(0)
  private shape: LayerMaskShape = "none"
  private scope: LayerMaskScope = "effect"
  private invert = false
  private enabled = true

  update(mask: LayerMaskState | null | undefined): boolean {
    const next = mask ?? DEFAULT_LAYER_MASK
    const structural =
      next.shape !== this.shape ||
      next.scope !== this.scope ||
      next.invert !== this.invert ||
      next.enabled !== this.enabled
    this.shape = next.shape
    this.scope = next.scope
    this.invert = next.invert
    this.enabled = next.enabled
    ;(this.center.value as THREE.Vector2).set(next.center[0], next.center[1])
    ;(this.size.value as THREE.Vector2).set(
      Math.max(MIN_SIZE, Math.abs(next.size[0])),
      Math.max(MIN_SIZE, Math.abs(next.size[1]))
    )
    this.rotation.value = (next.rotation * Math.PI) / 180
    this.feather.value = Math.max(0, next.feather)
    if (next.shape === "brush") {
      if (!this.paintTexture) {
        this.paintTexture = new THREE.DataTexture(
          new Uint8Array(CELL_PAINT_SIZE ** 2),
          CELL_PAINT_SIZE,
          CELL_PAINT_SIZE,
          THREE.RedFormat
        )
        this.paintTexture.minFilter = THREE.LinearFilter
        this.paintTexture.magFilter = THREE.LinearFilter
        this.paintValue = ""
      }
      if (next.paint !== this.paintValue) {
        const decoded = decodeCellPaintMask(next.paint)
        this.paintTexture.image.data?.set(decoded.data)
        this.paintTexture.needsUpdate = true
        ;(this.paintAspect.value as THREE.Vector2).set(
          decoded.width,
          decoded.height
        )
        this.paintValue = next.paint
      }
    }
    return structural
  }

  updateSceneDepth(depth: THREE.Texture | null): void {
    this.depthNode.value = depth ?? this.depthPlaceholder
    this.hasDepth.value = depth ? 1 : 0
  }

  updateLogicalSize(width: number, height: number): void {
    const shorter = Math.max(1, Math.min(width, height))
    ;(this.aspect.value as THREE.Vector2).set(
      Math.max(1, width) / shorter,
      Math.max(1, height) / shorter
    )
  }

  isActive(): boolean {
    return this.enabled && this.shape !== "none"
  }

  coverage(): TSLNode {
    const screen = vec2(uv().x, float(1).sub(uv().y))
    const point = screen.sub(0.5).mul(this.aspect)
    const local = point.sub(this.center)
    const c = cos(this.rotation)
    const s = sin(this.rotation)
    const q = vec2(
      local.x.mul(c).add(local.y.mul(s)),
      local.y.mul(c).sub(local.x.mul(s))
    )
    const half = this.size.mul(0.5)
    const softness = max(this.feather, float(0.0005))
    let value: TSLNode
    switch (this.shape) {
      case "linear":
        value = clamp(
          float(0.5).sub(q.x.div(max(this.size.x, float(MIN_SIZE)))),
          0,
          1
        )
        break
      case "radial":
        value = clamp(float(1).sub(length(q.div(half))), 0, 1)
        break
      case "rectangle": {
        const d = abs(q).sub(half)
        const distance = length(max(d, vec2(0))).add(
          min(max(d.x, d.y), float(0))
        )
        value = float(1).sub(smoothstep(softness.negate(), softness, distance))
        break
      }
      case "depth": {
        const depth = float(this.depthNode.r)
        const near = min(this.size.x, this.size.y)
        const far = max(this.size.x, this.size.y)
        const band = smoothstep(near.sub(softness), near.add(softness), depth).mul(
          float(1).sub(smoothstep(far.sub(softness), far.add(softness), depth))
        )
        value = mix(float(1), band, this.hasDepth)
        break
      }
      case "brush": {
        const paintUv = point.div(this.paintAspect).add(0.5)
        const inside = paintUv.x
          .greaterThanEqual(0)
          .and(paintUv.x.lessThan(1))
          .and(paintUv.y.greaterThanEqual(0))
          .and(paintUv.y.lessThan(1))
        const sampled = this.paintTexture
          ? texture(this.paintTexture).sample(paintUv).level(0).r
          : float(0)
        value = select(inside, sampled, float(0))
        break
      }
      default: {
        const distance = length(q.div(half))
          .sub(1)
          .mul(min(half.x, half.y))
        value = float(1).sub(smoothstep(softness.negate(), softness, distance))
        break
      }
    }
    return this.invert ? float(1).sub(value) : value
  }

  apply(input: TSLNode, composited: TSLNode, role: LayerMaskRole): TSLNode {
    if (!this.isActive()) return composited
    const coverage = this.coverage()
    const compositedAlpha = clamp(float(composited.a), float(0), float(1))
    if (this.scope === "content" && role !== "source") {
      return vec4(composited.rgb, compositedAlpha.mul(coverage))
    }
    const inputAlpha = clamp(float(input.a), float(0), float(1))
    const outputAlpha = mix(inputAlpha, compositedAlpha, coverage)
    const premultiplied = mix(
      input.rgb.mul(inputAlpha),
      composited.rgb.mul(compositedAlpha),
      coverage
    )
    return vec4(
      premultiplied.div(
        select(outputAlpha.greaterThan(0), outputAlpha, float(1))
      ),
      outputAlpha
    )
  }

  dispose(): void {
    this.paintTexture?.dispose()
    this.paintTexture = null
    this.paintValue = ""
    this.depthPlaceholder.dispose()
  }
}
