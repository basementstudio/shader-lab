import * as THREE from "three/webgpu"
import {
  abs,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  max,
  min,
  mix,
  select,
  sin,
  smoothstep,
  step,
  texture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
function number(
  value: unknown,
  fallback: number,
  low: number,
  high: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(low, Math.min(high, value))
    : fallback
}

/** Select photographic cells without replacing their interiors with flat samples. */
export class PhotographicCellsPass extends PassNode {
  private readonly size = uniform(0.1)
  private readonly cellAspect = uniform(1)
  private readonly irregularity = uniform(0.35)
  private readonly seed = uniform(1)
  private readonly selection = uniform(0)
  private readonly threshold = uniform(0.35)
  private readonly invert = uniform(0)
  private readonly gap = uniform(0.08)
  private readonly softness = uniform(0)
  private readonly outline = uniform(0)
  private readonly outlineColor = uniform(new THREE.Color("#e8e5dc"))
  private readonly cutout = uniform(1)
  private readonly aspect = uniform(new THREE.Vector2(1, 1))
  private readonly resolution = uniform(new THREE.Vector2(1, 1))
  private readonly source: Node
  private readonly placeholder: THREE.Texture

  constructor(id: string) {
    super(id)
    this.placeholder = new THREE.Texture()
    this.placeholder.type = THREE.HalfFloatType
    this.placeholder.minFilter = THREE.NearestFilter
    this.placeholder.magFilter = THREE.NearestFilter
    this.placeholder.generateMipmaps = false
    this.source = texture(this.placeholder)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    input: THREE.Texture,
    output: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.source.value = input
    super.render(renderer, input, output, time, delta)
  }

  override resize(width: number, height: number): void {
    ;(this.resolution.value as THREE.Vector2).set(
      Math.max(1, width),
      Math.max(1, height)
    )
  }

  override updateLogicalSize(width: number, height: number): void {
    const shorter = Math.max(1, Math.min(width, height))
    ;(this.aspect.value as THREE.Vector2).set(
      Math.max(1, width) / shorter,
      Math.max(1, height) / shorter
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.size.value = number(params.size, 0.1, 0.015, 0.5)
    this.cellAspect.value = number(params.cellAspect, 1, 0.25, 4)
    this.irregularity.value = number(params.irregularity, 0.35, 0, 1)
    this.seed.value = number(params.seed, 1, 0, 1000)
    this.selection.value = 0
    if (params.selection === "dark") this.selection.value = 1
    if (params.selection === "random") this.selection.value = 2
    this.threshold.value = number(params.threshold, 0.35, 0, 1)
    this.invert.value = params.invert === true ? 1 : 0
    this.gap.value = number(params.gap, 0.08, 0, 1)
    this.softness.value = number(params.softness, 0, 0, 0.025)
    this.outline.value = number(params.outline, 0, 0, 0.5)
    ;(this.outlineColor.value as THREE.Color).set(
      typeof params.outlineColor === "string" ? params.outlineColor : "#e8e5dc"
    )
    this.cutout.value = params.output === "keep-image" ? 0 : 1
  }

  protected override buildEffectNode(): Node {
    if (!this.source) return this.inputNode
    return Fn(() => {
      const hash = (value: Node) =>
        fract(
          sin(dot(value, vec2(127.1, 311.7)).add(this.seed.mul(74.7))).mul(
            43758.5453
          )
        )
      const screen = vec2(uv().x, float(1).sub(uv().y))
      const point = screen.sub(0.5).mul(this.aspect)
      const row = floor(point.y.div(this.size))
      // Rows vary in width and stagger, but still partition the plane exactly.
      const width = this.size
        .mul(this.cellAspect)
        .mul(mix(1, hash(vec2(row, 17)).mul(0.8).add(0.6), this.irregularity))
      const shift = hash(vec2(row, 53))
        .sub(0.5)
        .mul(width)
        .mul(this.irregularity)
      const column = floor(point.x.add(shift).div(width))
      const center = vec2(
        column.add(0.5).mul(width).sub(shift),
        row.add(0.5).mul(this.size)
      )
      const cell = vec2(width, this.size)
      const local = abs(point.sub(center))
      const half = cell.mul(float(1).sub(this.gap)).mul(0.5)
      const distance = max(local.x.sub(half.x), local.y.sub(half.y))
      const pixel = max(
        this.aspect.x.div(this.resolution.x),
        this.aspect.y.div(this.resolution.y)
      )
      const edge = max(pixel.mul(0.75), this.softness)
      const coverage = select(
        this.gap.equal(0),
        float(1),
        float(1).sub(smoothstep(edge.negate(), edge, distance))
      ).mul(select(this.gap.greaterThanEqual(1), float(0), float(1)))
      // Only cell selection uses a coarse sample; the visible color stays full-resolution.
      const inset = vec2(0.5).div(this.resolution)
      const probeUv = clamp(
        center.div(this.aspect).add(0.5),
        inset,
        vec2(1).sub(inset)
      )
      const probe = this.source.sample(probeUv).level(0)
      const luma = clamp(dot(probe.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 1)
      const score = select(
        this.selection.greaterThan(1.5),
        hash(vec2(column, row)),
        select(this.selection.greaterThan(0.5), float(1).sub(luma), luma)
      )
      const chosen = select(
        this.threshold.lessThanEqual(0),
        float(1),
        select(
          this.threshold.greaterThanEqual(1),
          float(0),
          step(this.threshold, score)
        )
      )
      const selected = select(
        this.invert.greaterThan(0.5),
        float(1).sub(chosen),
        chosen
      )
      const mask = coverage.mul(selected)
      const strokeWidth = min(width, this.size).mul(this.outline)
      const stroke = smoothstep(
        strokeWidth.negate().sub(edge),
        strokeWidth.negate().add(edge),
        distance
      ).mul(select(this.outline.greaterThan(0), float(1), float(0)))
      const original = this.inputNode
      const rgb = mix(original.rgb, this.outlineColor, stroke)
      // Outlines never manufacture coverage in transparent parts of the source.
      return select(
        this.cutout.greaterThan(0.5),
        vec4(rgb, original.a.mul(mask)),
        vec4(mix(original.rgb, rgb, mask), original.a)
      )
    })()
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
