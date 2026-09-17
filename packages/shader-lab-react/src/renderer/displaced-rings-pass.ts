import * as THREE from "three/webgpu"
import {
  cos,
  float,
  Fn,
  fract,
  If,
  int,
  length,
  Loop,
  max,
  min,
  mix,
  pow,
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

/** Inverse-map each photographic band; overlap paints outer bands before inner ones. */
export class DisplacedRingsPass extends PassNode {
  private readonly count = uniform(8)
  private readonly radius = uniform(0.9)
  private readonly distribution = uniform(1)
  private readonly center = uniform(new THREE.Vector2(0.5, 0.5))
  private readonly offset = uniform(new THREE.Vector2(0.045, 0))
  private readonly rotation = uniform(0)
  private readonly rotationStep = uniform((12 * Math.PI) / 180)
  private readonly scaleStep = uniform(0)
  private readonly gap = uniform(0.04)
  private readonly softness = uniform(0)
  private readonly halfDiscs = uniform(0)
  private readonly cutout = uniform(0)
  private readonly pattern = uniform(0)
  private readonly seed = uniform(1)
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
    this.count.value = Math.round(number(params.count, 8, 1, 128))
    this.radius.value = number(params.radius, 0.9, 0.01, 2)
    this.distribution.value = number(params.distribution, 1, 0.25, 3)
    const center = Array.isArray(params.center) ? params.center : [0, 0]
    ;(this.center.value as THREE.Vector2).set(
      0.5 + number(center[0], 0, -1, 1),
      0.5 - number(center[1], 0, -1, 1)
    )
    const offset = Array.isArray(params.offset) ? params.offset : [0.045, 0]
    ;(this.offset.value as THREE.Vector2).set(
      number(offset[0], 0.045, -1, 1),
      -number(offset[1], 0, -1, 1)
    )
    this.rotation.value =
      (number(params.rotation, 0, -180, 180) * Math.PI) / 180
    this.rotationStep.value =
      (number(params.rotationStep, 12, -180, 180) * Math.PI) / 180
    this.scaleStep.value = number(params.scaleStep, 0, -0.9, 3)
    this.gap.value = number(params.gap, 0.04, 0, 1)
    this.softness.value = number(params.softness, 0, 0, 0.1)
    this.halfDiscs.value = params.shape === "half-discs" ? 1 : 0
    this.cutout.value = params.output === "cutout" ? 1 : 0
    this.pattern.value = 0
    if (params.pattern === "progressive") this.pattern.value = 1
    if (params.pattern === "random") this.pattern.value = 2
    this.seed.value = number(params.seed, 1, 0, 1000)
  }

  protected override buildEffectNode(): Node {
    if (!this.source) return this.inputNode
    return Fn(() => {
      const screen = vec2(uv().x, float(1).sub(uv().y))
      const point = screen.sub(this.center).mul(this.aspect)
      const original = this.inputNode
      // Work in premultiplied color only while accumulating soft coverage.
      const rgb = select(
        this.cutout.greaterThan(0.5),
        vec3(0),
        original.rgb.mul(original.a)
      ).toVar()
      const alpha = select(
        this.cutout.greaterThan(0.5),
        float(0),
        original.a
      ).toVar()
      const edge = max(
        max(
          this.aspect.x.div(this.resolution.x),
          this.aspect.y.div(this.resolution.y)
        ).mul(0.75),
        this.softness
      )
      // Shared boundaries must not apply antialias coverage twice: touching
      // concentric bands partition the image without translucent seams.
      const sharedEdges = this.gap
        .equal(0)
        .and(this.softness.equal(0))
        .and(length(this.offset).equal(0))
        .and(this.halfDiscs.equal(0))
      Loop({ start: 0, end: int(this.count), type: "int" }, ({ i }) => {
        const index = this.count.sub(1).sub(float(i))
        const progress = index.div(max(this.count.sub(1), 1))
        const alternating = select(
          index.mod(2).lessThan(1),
          float(-1),
          float(1)
        )
        const random = fract(
          sin(index.mul(127.1).add(this.seed.mul(311.7))).mul(43758.5453)
        )
          .mul(2)
          .sub(1)
        const displacement = select(
          this.pattern.greaterThan(1.5),
          random,
          select(
            this.pattern.greaterThan(0.5),
            progress,
            alternating.mul(progress.mul(0.65).add(0.35))
          )
        )
        const moved = point.sub(this.offset.mul(displacement))
        const angle = this.rotation.add(this.rotationStep.mul(index))
        const c = cos(angle)
        const s = sin(angle)
        const local = vec2(
          moved.x.mul(c).add(moved.y.mul(s)),
          moved.y.mul(c).sub(moved.x.mul(s))
        )
        const distance = length(local)
        const inner = pow(index.div(this.count), this.distribution).mul(
          this.radius
        )
        const outer = pow(index.add(1).div(this.count), this.distribution).mul(
          this.radius
        )
        const inset = outer.sub(inner).mul(this.gap).mul(0.5)
        const softOuter = float(1).sub(
          smoothstep(
            outer.sub(inset).sub(edge),
            outer.sub(inset).add(edge),
            distance
          )
        )
        const insideOuter = select(
          sharedEdges.and(index.lessThan(this.count.sub(1))),
          float(1).sub(step(outer, distance)),
          softOuter
        )
        const softInner = select(
          index.equal(0),
          float(1),
          smoothstep(
            inner.add(inset).sub(edge),
            inner.add(inset).add(edge),
            distance
          )
        )
        const outsideInner = select(
          sharedEdges,
          step(inner, distance),
          softInner
        )
        const half = select(
          this.halfDiscs.greaterThan(0.5),
          smoothstep(edge.negate(), edge, local.y.negate()),
          float(1)
        )
        const coverage = insideOuter
          .mul(outsideInner)
          .mul(half)
          .mul(select(this.gap.greaterThanEqual(1), float(0), float(1)))
        If(coverage.greaterThan(0), () => {
          const scale = max(float(1).add(this.scaleStep.mul(progress)), 0.1)
          const sampleUv = local.div(scale).div(this.aspect).add(this.center)
          const bounds = step(0, sampleUv.x)
            .mul(step(sampleUv.x, 1))
            .mul(step(0, sampleUv.y))
            .mul(step(sampleUv.y, 1))
          // Explicit LOD makes texture sampling valid in per-pixel loop branches.
          const sample = this.source.sample(sampleUv).level(0)
          const sampleAlpha = sample.a.mul(bounds)
          const amount = sampleAlpha.mul(coverage)
          const nextRgb = sample.rgb
            .mul(amount)
            .add(rgb.mul(float(1).sub(amount)))
          const nextAlpha = amount.add(alpha.mul(float(1).sub(amount)))
          rgb.assign(
            select(
              this.cutout.greaterThan(0.5),
              nextRgb,
              mix(rgb, sample.rgb.mul(sampleAlpha), coverage)
            )
          )
          alpha.assign(
            select(
              this.cutout.greaterThan(0.5),
              nextAlpha,
              mix(alpha, sampleAlpha, coverage)
            )
          )
        })
      })
      return vec4(
        rgb.div(select(alpha.greaterThan(0), alpha, float(1))),
        min(alpha, 1)
      )
    })()
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
