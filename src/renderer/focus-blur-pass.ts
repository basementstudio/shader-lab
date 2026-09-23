import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  Loop,
  max,
  min,
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

const LENS_TAPS = 24
const MOTION_TAPS = 24
const GOLDEN_ANGLE = 2.399963229728653

const SOURCE_MODES: Record<string, number> = {
  depth: 1,
  linear: 2,
  luminance: 4,
  radial: 3,
  uniform: 0,
}
const KIND_MODES: Record<string, number> = { gaussian: 0, lens: 1, motion: 2 }


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


export class FocusBlurPass extends PassNode {
  private readonly sourceUniform: Node
  private readonly kindUniform: Node
  private readonly radiusUniform: Node
  private readonly focusUniform: Node
  private readonly rangeUniform: Node
  private readonly transitionUniform: Node
  private readonly centerUniform: Node
  private readonly angleUniform: Node
  private readonly invertUniform: Node
  private readonly motionAngleUniform: Node
  private readonly highlightsUniform: Node
  private readonly grainUniform: Node
  private readonly grainSizeUniform: Node
  private readonly grainFollowUniform: Node
  private readonly hasDepthUniform: Node
  private readonly outputPerDocumentUniform: Node
  private readonly aspectUniform: Node
  private readonly documentSizeUniform: Node
  private readonly placeholder = new THREE.Texture()
  private readonly depthPlaceholder = new THREE.Texture()
  private readonly pyramid = new BlurPyramid()
  private colorNode: Node | null = null
  private depthNode: Node | null = null
  private outputWidth = 1
  private logicalWidth = 1
  private logicalHeight = 1

  constructor(layerId: string) {
    super(layerId)
    this.sourceUniform = uniform(0)
    this.kindUniform = uniform(0)
    this.radiusUniform = uniform(24)
    this.focusUniform = uniform(0.8)
    this.rangeUniform = uniform(0.15)
    this.transitionUniform = uniform(0.4)
    this.centerUniform = uniform(new THREE.Vector2(0, 0))
    this.angleUniform = uniform(0)
    this.invertUniform = uniform(0)
    this.motionAngleUniform = uniform(0)
    this.highlightsUniform = uniform(0)
    this.grainUniform = uniform(0)
    this.grainSizeUniform = uniform(1.2)
    this.grainFollowUniform = uniform(0.5)
    this.hasDepthUniform = uniform(0)
    this.outputPerDocumentUniform = uniform(1)
    this.aspectUniform = uniform(new THREE.Vector2(1, 1))
    this.documentSizeUniform = uniform(new THREE.Vector2(1, 1))
    this.rebuildEffectNode()
  }

  override resize(width: number, height: number): void {
    this.outputWidth = Math.max(1, width)
    this.pyramid.resize(width, height)
    this.syncScale()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    const shorter = Math.min(this.logicalWidth, this.logicalHeight)
    ;(this.aspectUniform.value as THREE.Vector2).set(
      this.logicalWidth / shorter,
      this.logicalHeight / shorter
    )
    ;(this.documentSizeUniform.value as THREE.Vector2).set(
      this.logicalWidth,
      this.logicalHeight
    )
    this.syncScale()
  }

  private syncScale(): void {
    this.outputPerDocumentUniform.value = this.outputWidth / this.logicalWidth
  }

  override updateParams(params: LayerParameterValues): void {
    this.sourceUniform.value = SOURCE_MODES[String(params.blurFrom)] ?? 0
    this.kindUniform.value = KIND_MODES[String(params.kind)] ?? 0
    this.radiusUniform.value = readNumber(params.radius, 24, 0, 400)
    this.focusUniform.value = readNumber(params.focus, 0.8, 0, 1)
    this.rangeUniform.value = readNumber(params.range, 0.15, 0, 2)
    this.transitionUniform.value = readNumber(params.transition, 0.4, 0.01, 2)
    const center = Array.isArray(params.center) ? params.center : [0, 0]
    ;(this.centerUniform.value as THREE.Vector2).set(
      readNumber(center[0], 0, -1, 1),
      readNumber(center[1], 0, -1, 1)
    )
    this.angleUniform.value =
      (readNumber(params.angle, 0, -180, 180) * Math.PI) / 180
    this.invertUniform.value = params.invertFocus === true ? 1 : 0
    this.motionAngleUniform.value =
      (readNumber(params.motionAngle, 0, -180, 180) * Math.PI) / 180
    this.highlightsUniform.value = readNumber(params.highlights, 0, 0, 3)
    this.grainUniform.value = readNumber(params.grain, 0, 0, 1)
    this.grainSizeUniform.value = readNumber(params.grainSize, 1.2, 0.5, 6)
    this.grainFollowUniform.value = readNumber(params.grainFollow, 0.5, 0, 1)
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
    const depth = this.sceneDepthTexture
    this.hasDepthUniform.value = depth ? 1 : 0
    if (this.depthNode) this.depthNode.value = depth ?? this.depthPlaceholder
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  private sampleLevel(point: Node, level: Node, smooth: boolean): Node {
    return this.pyramid.sample(this.colorNode as Node, point, level, smooth)
  }

  private levelFor(radiusOutput: Node): Node {
    return this.pyramid.levelFor(radiusOutput)
  }

  protected override buildEffectNode(): Node {
    if (!this.grainFollowUniform) {
      return this.inputNode
    }
    const colorNode = tslTexture(this.placeholder, renderTargetUv())
    this.colorNode = colorNode
    const depthNode = tslTexture(this.depthPlaceholder, renderTargetUv())
    this.depthNode = depthNode

    return Fn(() => {
      const targetUv = renderTargetUv()
      const point = targetUv.sub(0.5).mul(this.aspectUniform)
      const center = vec2(this.centerUniform.x, this.centerUniform.y.negate()).mul(
        0.5
      )
      const local = point.sub(center.mul(this.aspectUniform))
      const normal = vec2(sin(this.angleUniform), cos(this.angleUniform))
      const linearDistance = abs(dot(local, normal))
      const radialDistance = local.length()
      const depth = float(depthNode.sample(targetUv).level(0).r)
      const source = colorNode.sample(targetUv).level(0)
      const tone = perceptualLuma(source)
      const halfRange = this.rangeUniform.mul(0.5)
      const transition = max(this.transitionUniform, float(0.001))
      const fromDistance = (distance: Node): Node =>
        clamp(distance.sub(halfRange).div(transition), 0, 1)
      const mode = this.sourceUniform
      const depthAmount = select(
        this.hasDepthUniform.greaterThan(0.5),
        fromDistance(abs(depth.sub(this.focusUniform))),
        float(0)
      )
      const luminanceAmount = smoothstep(
        this.focusUniform.sub(transition.mul(0.5)),
        this.focusUniform.add(transition.mul(0.5)),
        tone
      )
      const amount = select(
        mode.lessThan(0.5),
        float(1),
        select(
          mode.lessThan(1.5),
          depthAmount,
          select(
            mode.lessThan(2.5),
            fromDistance(linearDistance),
            select(mode.lessThan(3.5), fromDistance(radialDistance), luminanceAmount)
          )
        )
      )
      const shaped = select(
        this.invertUniform.greaterThan(0.5).and(mode.greaterThan(0.5)),
        float(1).sub(amount),
        amount
      )
      const radiusOutput = this.radiusUniform
        .mul(this.outputPerDocumentUniform)
        .mul(shaped)
      const outputTexel = vec2(
        float(1).div(this.documentSizeUniform.x.mul(this.outputPerDocumentUniform)),
        float(1).div(this.documentSizeUniform.y.mul(this.outputPerDocumentUniform))
      )
      const pixel = targetUv.mul(this.documentSizeUniform)
      const jitter = hash(pixel.add(17.3)).mul(6.2831853)

      const blurred = vec4(0).toVar()
      const kind = this.kindUniform
      If(kind.lessThan(0.5), () => {
        blurred.assign(this.sampleLevel(targetUv, this.levelFor(radiusOutput), true))
      })
      If(kind.greaterThan(0.5).and(kind.lessThan(1.5)), () => {
        const tapLevel = this.levelFor(radiusOutput.div(Math.sqrt(LENS_TAPS) * 0.9))
        const sum = vec4(0).toVar()
        const weights = float(0).toVar()
        Loop(
          { start: 0, end: LENS_TAPS, type: "int", name: "lensTap" },
          (inputs) => {
            const tap = float((inputs as unknown as Record<string, Node>).lensTap)
            const r = sqrt(tap.add(0.5).div(LENS_TAPS))
            const a = tap.mul(GOLDEN_ANGLE).add(jitter)
            const offset = vec2(cos(a), sin(a)).mul(r).mul(radiusOutput).mul(outputTexel)
            const sample = this.sampleLevel(targetUv.add(offset), tapLevel, false)
            const bright = perceptualLuma(
              vec4(sample.rgb.div(max(sample.a, float(0.0001))), sample.a)
            )
            const weight = float(1).add(pow(bright, float(4)).mul(this.highlightsUniform).mul(8))
            sum.addAssign(sample.mul(weight))
            weights.addAssign(weight)
          }
        )
        blurred.assign(sum.div(weights))
      })
      If(kind.greaterThan(1.5), () => {
        const direction = vec2(cos(this.motionAngleUniform), sin(this.motionAngleUniform).negate())
        const tapLevel = this.levelFor(radiusOutput.div(MOTION_TAPS * 0.5))
        const sum = vec4(0).toVar()
        Loop(
          { start: 0, end: MOTION_TAPS, type: "int", name: "motionTap" },
          (inputs) => {
            const tap = float((inputs as unknown as Record<string, Node>).motionTap)
            const t = tap.add(0.5).div(MOTION_TAPS).sub(0.5).mul(2)
            const offset = direction.mul(t).mul(radiusOutput).mul(outputTexel)
            sum.addAssign(this.sampleLevel(targetUv.add(offset), tapLevel, false))
          }
        )
        blurred.assign(sum.div(MOTION_TAPS))
      })

      const alpha = clamp(blurred.a, 0, 1)
      const rgb = blurred.rgb.div(max(blurred.a, float(0.0001)))
      const grainCell = floor(pixel.div(this.grainSizeUniform))
      const noise = hash(grainCell).add(hash(grainCell.add(31.7))).sub(1)
      const grainWeight = mix(float(1), shaped, this.grainFollowUniform)
      const grained = rgb.add(noise.mul(this.grainUniform).mul(0.25).mul(grainWeight))
      return vec4(clamp(grained, 0, 1), min(alpha, float(1)))
    })()
  }

  override dispose(): void {
    this.pyramid.dispose()
    this.placeholder.dispose()
    this.depthPlaceholder.dispose()
    super.dispose()
  }
}
