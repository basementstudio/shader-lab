import {
  abs,
  atan,
  clamp,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  length,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { BlurPyramid } from "@/renderer/blur-pyramid"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const MODES: Record<string, number> = {
  contour: 3,
  flow: 2,
  hatch: 0,
  spiral: 5,
  squiggle: 1,
  stipple: 4,
}
const COLOR_MODES: Record<string, number> = { ink: 0, pens: 2, source: 1 }

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

function hash(p: Node): Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031))
  const shifted = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(shifted.x.add(shifted.y).mul(shifted.z))
}

function hash2(p: Node): Node {
  const q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))
  return fract(sin(q).mul(43758.5453))
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

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

/** Pen-plotter drawing: every mode is a set of strokes laid over paper with multiplied ink. */
export class PlotterPass extends PassNode {
  private readonly modeUniform: Node
  private readonly colorModeUniform: Node
  private readonly gapUniform: Node
  private readonly weightUniform: Node
  private readonly pressureUniform: Node
  private readonly angleUniform: Node
  private readonly crosshatchUniform: Node
  private readonly crossAngleUniform: Node
  private readonly thresholdUniform: Node
  private readonly wobbleUniform: Node
  private readonly levelsUniform: Node
  private readonly smoothingUniform: Node
  private readonly amplitudeUniform: Node
  private readonly frequencyUniform: Node
  private readonly centerUniform: Node
  private readonly bleedUniform: Node
  private readonly paperUniform: Node
  private readonly paperGrainUniform: Node
  private readonly transparentUniform: Node
  private readonly inkUniform: Node
  private readonly pen2Uniform: Node
  private readonly pen3Uniform: Node
  private readonly documentSizeUniform: Node
  private readonly outputPerDocumentUniform: Node
  private readonly aaUniform: Node
  private readonly pyramid = new BlurPyramid()
  private readonly placeholder = new THREE.Texture()
  private colorNode: Node | null = null
  private outputWidth = 1
  private logicalWidth = 1

  constructor(layerId: string) {
    super(layerId)
    this.modeUniform = uniform(0)
    this.colorModeUniform = uniform(0)
    this.gapUniform = uniform(12)
    this.weightUniform = uniform(1.5)
    this.pressureUniform = uniform(0.5)
    this.angleUniform = uniform(Math.PI / 2)
    this.crosshatchUniform = uniform(1)
    this.crossAngleUniform = uniform((135 * Math.PI) / 180)
    this.thresholdUniform = uniform(0.5)
    this.wobbleUniform = uniform(0.3)
    this.levelsUniform = uniform(8)
    this.smoothingUniform = uniform(4)
    this.amplitudeUniform = uniform(0.45)
    this.frequencyUniform = uniform(0.5)
    this.centerUniform = uniform(new THREE.Vector2(0, 0))
    this.bleedUniform = uniform(0.3)
    this.paperUniform = uniform(new THREE.Color("#f5f0e8"))
    this.paperGrainUniform = uniform(0.2)
    this.transparentUniform = uniform(0)
    this.inkUniform = uniform(new THREE.Color("#1a1a1a"))
    this.pen2Uniform = uniform(new THREE.Color("#d8452f"))
    this.pen3Uniform = uniform(new THREE.Color("#2f5fd8"))
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.outputPerDocumentUniform = uniform(1)
    this.aaUniform = uniform(0.8)
    this.rebuildEffectNode()
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.pyramid.resize(width, height)
    this.syncScale()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    ;(this.documentSizeUniform.value as THREE.Vector2).set(
      this.logicalWidth,
      Math.max(1, height)
    )
    this.syncScale()
  }

  private syncScale(): void {
    const scale = this.outputWidth / this.logicalWidth
    this.outputPerDocumentUniform.value = scale
    this.aaUniform.value = 0.8 / scale
  }

  override updateParams(params: LayerParameterValues): void {
    this.modeUniform.value = MODES[String(params.mode)] ?? 0
    this.colorModeUniform.value = COLOR_MODES[String(params.colorMode)] ?? 0
    this.gapUniform.value = readNumber(params.gap, 12, 2, 120)
    this.weightUniform.value = readNumber(params.weight, 1.5, 0.25, 12)
    this.pressureUniform.value = readNumber(params.pressure, 0.5, 0, 1)
    this.angleUniform.value = (readNumber(params.angle, 90, 0, 180) * Math.PI) / 180
    this.crosshatchUniform.value = params.crosshatch === false ? 0 : 1
    this.crossAngleUniform.value =
      (readNumber(params.crossAngle, 135, 0, 180) * Math.PI) / 180
    this.thresholdUniform.value = readNumber(params.threshold, 0.5, 0, 1)
    this.wobbleUniform.value = readNumber(params.wobble, 0.3, 0, 1)
    this.levelsUniform.value = Math.round(readNumber(params.levels, 8, 1, 60))
    this.smoothingUniform.value = readNumber(params.smoothing, 4, 0, 80)
    this.amplitudeUniform.value = readNumber(params.amplitude, 0.45, 0, 1)
    this.frequencyUniform.value = readNumber(params.frequency, 0.5, 0.05, 2)
    const center = Array.isArray(params.center) ? params.center : [0, 0]
    ;(this.centerUniform.value as THREE.Vector2).set(
      readNumber(center[0], 0, -1, 1),
      readNumber(center[1], 0, -1, 1)
    )
    this.bleedUniform.value = readNumber(params.bleed, 0.3, 0, 1)
    ;(this.paperUniform.value as THREE.Color).set(readColor(params.paperColor, "#f5f0e8"))
    this.paperGrainUniform.value = readNumber(params.paperGrain, 0.2, 0, 1)
    this.transparentUniform.value = params.paper === "transparent" ? 1 : 0
    ;(this.inkUniform.value as THREE.Color).set(readColor(params.inkColor, "#1a1a1a"))
    ;(this.pen2Uniform.value as THREE.Color).set(readColor(params.pen2Color, "#d8452f"))
    ;(this.pen3Uniform.value as THREE.Color).set(readColor(params.pen3Color, "#2f5fd8"))
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.pyramid.render(renderer, inputTexture)
    if (this.colorNode) this.colorNode.value = inputTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  private darknessAt(colorNode: Node, point: Node, level: Node): Node {
    const sample = this.pyramid.sample(colorNode, point, level, true)
    const straight = vec4(sample.rgb.div(max(sample.a, float(0.0001))), sample.a)
    return float(1).sub(perceptualLuma(straight)).mul(clamp(sample.a, 0, 1))
  }

  private stroke(distance: Node, width: Node): Node {
    const half = width.mul(0.5)
    const aa = this.aaUniform.add(this.bleedUniform.mul(0.6))
    return float(1).sub(smoothstep(half.sub(aa), half.add(aa), distance))
  }

  protected override buildEffectNode(): Node {
    if (!this.aaUniform) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode

    return Fn(() => {
      const targetUv = renderTargetUv()
      const size = this.documentSizeUniform
      const pixel = targetUv.mul(size)
      const gap = this.gapUniform
      const warp = vec2(
        valueNoise(pixel.div(gap.mul(3)).add(3.1)),
        valueNoise(pixel.div(gap.mul(3)).add(17.9))
      )
        .sub(0.5)
        .mul(this.wobbleUniform)
        .mul(gap)
        .mul(0.6)
      const p = pixel.add(warp)
      const level = this.pyramid.levelFor(
        this.smoothingUniform.mul(this.outputPerDocumentUniform)
      )
      const at = (point: Node): Node =>
        this.darknessAt(colorNode, point.div(size), level)
      const dark = at(p)
      const width = mix(
        this.weightUniform,
        this.weightUniform.mul(2.2),
        this.pressureUniform.mul(dark)
      )
      const inkVariation = valueNoise(p.div(gap.mul(0.7)).add(41.2))
        .mul(this.bleedUniform)
        .mul(0.35)
        .add(float(1).sub(this.bleedUniform.mul(0.2)))

      const pen1 = float(0).toVar()
      const pen2 = float(0).toVar()
      const pen3 = float(0).toVar()
      const mode = this.modeUniform
      const threshold = this.thresholdUniform

      If(mode.lessThan(0.5), () => {
        const layer = (angle: Node, start: Node) => {
          const normal = vec2(cos(angle), sin(angle))
          const u = dot(p, normal).div(gap)
          const distance = abs(fract(u).sub(0.5)).mul(gap)
          const on = smoothstep(start, start.add(0.08), dark)
          return this.stroke(distance, width).mul(on)
        }
        const rest = float(1).sub(threshold)
        pen1.assign(layer(this.angleUniform, threshold.mul(0.5)))
        pen2.assign(
          layer(this.crossAngleUniform, threshold).mul(this.crosshatchUniform)
        )
        pen3.assign(
          layer(
            this.angleUniform.add(this.crossAngleUniform).mul(0.5).add(Math.PI / 2),
            threshold.add(rest.mul(0.5))
          ).mul(this.crosshatchUniform)
        )
      })

      If(mode.greaterThan(0.5).and(mode.lessThan(1.5)), () => {
        const normal = vec2(cos(this.angleUniform), sin(this.angleUniform))
        const tangent = vec2(normal.y.negate(), normal.x)
        const along = dot(p, tangent)
        const across = dot(p, normal).div(gap)
        const row = floor(across.add(0.5))
        const rowCenter = row.mul(gap).mul(normal).add(tangent.mul(along))
        const rowDark = at(rowCenter)
        const frequency = this.frequencyUniform.mul(Math.PI * 2).div(gap)
        const amplitude = pow(rowDark, float(1.6)).mul(this.amplitudeUniform).mul(gap).mul(0.95)
        const wave = sin(along.mul(frequency).add(row.mul(1.7)))
        const offset = across.sub(row).mul(gap).sub(amplitude.mul(wave))
        const slope = amplitude.mul(frequency).mul(cos(along.mul(frequency).add(row.mul(1.7))))
        const distance = abs(offset).div(sqrt(float(1).add(slope.mul(slope))))
        pen1.assign(this.stroke(distance, width).mul(smoothstep(0.02, 0.12, rowDark.add(threshold.mul(0.1)))))
      })

      If(mode.greaterThan(1.5).and(mode.lessThan(3.5)), () => {
        const step = max(float(1), this.smoothingUniform.mul(0.5))
        const dx = at(p.add(vec2(step, 0))).sub(at(p.sub(vec2(step, 0)))).div(step.mul(2))
        const dy = at(p.add(vec2(0, step))).sub(at(p.sub(vec2(0, step)))).div(step.mul(2))
        const gradient = max(length(vec2(dx, dy)), float(0.0005))
        const flow = mode.lessThan(2.5)
        const levels = select(flow, size.x.div(gap).mul(0.25), this.levelsUniform)
        const value = dark.mul(levels)
        const distance = abs(fract(value).sub(0.5)).div(gradient.mul(levels))
        const lineWidth = select(flow, width.mul(mix(float(0.5), float(1.3), dark)), width)
        const visible = select(
          flow,
          smoothstep(threshold.mul(0.3), threshold.mul(0.3).add(0.12), dark),
          float(1)
        )
        pen1.assign(this.stroke(distance, lineWidth).mul(visible))
      })

      If(mode.greaterThan(3.5).and(mode.lessThan(4.5)), () => {
        const cellSize = gap.mul(0.5)
        const base = floor(pixel.div(cellSize))
        const coverage = float(0).toVar()
        for (let y = -1; y <= 1; y += 1) {
          for (let x = -1; x <= 1; x += 1) {
            const cell = base.add(vec2(x, y))
            const random = hash2(cell)
            const center = cell.add(random).mul(cellSize)
            const tone = at(center)
            const keep = select(
              hash(cell.add(9.1)).lessThan(pow(tone, float(1).add(threshold.mul(2)))),
              float(1),
              float(0)
            )
            coverage.assign(
              max(coverage, this.stroke(length(pixel.sub(center)), width.mul(1.4)).mul(keep))
            )
          }
        }
        pen1.assign(coverage)
      })

      If(mode.greaterThan(4.5), () => {
        const center = vec2(this.centerUniform.x, this.centerUniform.y.negate())
          .mul(0.5)
          .add(0.5)
          .mul(size)
        const local = p.sub(center)
        const radius = length(local)
        const turn = atan(local.y, local.x).div(Math.PI * 2)
        const ring = radius.div(gap).sub(turn)
        const distance = abs(fract(ring).sub(0.5)).mul(gap)
        const spiralWidth = mix(this.weightUniform.mul(0.3), gap.mul(0.9), pow(dark, float(1.2)))
        pen1.assign(this.stroke(distance, spiralWidth).mul(smoothstep(0.01, 0.06, dark)))
      })

      const source = colorNode.sample(targetUv).level(0)
      const sourceRgb = vec3(source.r, source.g, source.b)
      const colorMode = this.colorModeUniform
      const ink1 = select(
        colorMode.lessThan(0.5),
        vec3(this.inkUniform),
        select(colorMode.lessThan(1.5), sourceRgb, vec3(this.inkUniform))
      )
      const ink2 = select(colorMode.greaterThan(1.5), vec3(this.pen2Uniform), ink1)
      const ink3 = select(colorMode.greaterThan(1.5), vec3(this.pen3Uniform), ink1)

      const grain = valueNoise(pixel.div(1.3))
        .sub(0.5)
        .mul(this.paperGrainUniform)
        .mul(0.08)
      const paper = clamp(vec3(this.paperUniform).add(grain), 0, 1)
      const apply = (surface: Node, amount: Node, ink: Node) =>
        mix(surface, surface.mul(ink), clamp(amount.mul(inkVariation), 0, 1))
      const onPaper = apply(apply(apply(paper, pen1, ink1), pen2, ink2), pen3, ink3)
      const cover = clamp(
        float(1).sub(
          float(1)
            .sub(clamp(pen1, 0, 1))
            .mul(float(1).sub(clamp(pen2, 0, 1)))
            .mul(float(1).sub(clamp(pen3, 0, 1)))
        ),
        0,
        1
      )
      const inkOnly = apply(apply(apply(vec3(1), pen1, ink1), pen2, ink2), pen3, ink3)
      const transparent = this.transparentUniform.greaterThan(0.5)
      return vec4(
        select(transparent, inkOnly, onPaper),
        select(transparent, cover, float(1))
      )
    })()
  }

  override dispose(): void {
    this.pyramid.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
