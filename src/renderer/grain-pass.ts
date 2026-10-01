import {
  abs,
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  max,
  min,
  mix,
  pow,
  select,
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

const FILM_FRAME_RATE = 24
const FRAME_CYCLE = 4096
const NOISE_SIZE = 256
const LATTICES = [0.61, 2.7044, 4.7988] as const
const BLEND_MODES: Record<string, number> = {
  "soft-light": 0,
  overlay: 1,
  add: 2,
}

function hash(p: Node): Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031))
  const shifted = p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)))
  return fract(shifted.x.add(shifted.y).mul(shifted.z))
}

function rotate(p: Node, angle: number): Node {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)))
}

function createNoiseTexture(): THREE.DataTexture {
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
  let state = 0x9e3779b9
  for (let index = 0; index < data.length; index += 1) {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    data[index] = ((t ^ (t >>> 14)) >>> 0) & 255
  }
  const noise = new THREE.DataTexture(
    data,
    NOISE_SIZE,
    NOISE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  )
  noise.wrapS = THREE.RepeatWrapping
  noise.wrapT = THREE.RepeatWrapping
  noise.magFilter = THREE.LinearFilter
  noise.minFilter = THREE.LinearFilter
  noise.generateMipmaps = false
  noise.needsUpdate = true
  return noise
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

export class GrainPass extends PassNode {
  private readonly amountUniform: Node
  private readonly sizeUniform: Node
  private readonly roughnessUniform: Node
  private readonly clumpingUniform: Node
  private readonly chromaUniform: Node
  private readonly responseUniform: Node
  private readonly blendUniform: Node
  private readonly frameUniform: Node
  private readonly seedUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly noise: THREE.DataTexture
  private readonly placeholder = new THREE.Texture()
  private readonly source: Node
  private speed = 1
  private grainClock = 0

  constructor(layerId: string) {
    super(layerId)
    this.amountUniform = uniform(0.35)
    this.sizeUniform = uniform(1.2)
    this.roughnessUniform = uniform(0.4)
    this.clumpingUniform = uniform(0.2)
    this.chromaUniform = uniform(0)
    this.responseUniform = uniform(0.5)
    this.blendUniform = uniform(0)
    this.frameUniform = uniform(0)
    this.seedUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.noise = createNoiseTexture()
    this.source = tslTexture(this.placeholder)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    timelineTime = time
  ): void {
    this.source.value = inputTexture
    this.grainClock = timelineTime
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.amountUniform.value = readNumber(params.amount, 0.35, 0, 1)
    this.sizeUniform.value = readNumber(params.size, 1.2, 0.5, 8)
    this.roughnessUniform.value = readNumber(params.roughness, 0.4, 0, 1)
    this.clumpingUniform.value = readNumber(params.clumping, 0.2, 0, 1)
    this.chromaUniform.value = readNumber(params.chroma, 0, 0, 1)
    this.responseUniform.value = readNumber(params.response, 0.5, 0, 1)
    this.blendUniform.value =
      BLEND_MODES[typeof params.blend === "string" ? params.blend : ""] ?? 0
    this.seedUniform.value = readNumber(params.seed, 0, 0, 9999)
    this.speed = readNumber(params.speed, 1, 0, 2.5)
  }

  override needsContinuousRender(): boolean {
    return this.speed > 0.0001
  }

  protected override beforeRender(): void {
    this.frameUniform.value =
      this.speed > 0.0001
        ? Math.floor(
            Math.max(0, this.grainClock) * FILM_FRAME_RATE * this.speed
          ) % FRAME_CYCLE
        : 0
  }

  private lattice(p: Node): Node {
    const cell = floor(p)
    const local = fract(p)
    const eased = local.mul(local).mul(float(3).sub(local.mul(2)))
    return tslTexture(
      this.noise,
      cell.add(eased).add(0.5).div(NOISE_SIZE)
    ).level(0)
  }

  protected override buildEffectNode(): Node {
    if (!this.noise) {
      return this.inputNode
    }

    return Fn(() => {
      const targetUv = vec2(uv().x, float(1).sub(uv().y))
      const center = this.source.sample(targetUv).level(0).toVar()
      const color = vec3(center.r, center.g, center.b).toVar()

      If(this.amountUniform.greaterThan(0.0001), () => {
        const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
        const pixel = targetUv.mul(size)
        const frame = this.frameUniform
        const offset = vec2(
          hash(vec2(frame, 1.7)).mul(613).add(this.seedUniform.mul(17.13)),
          hash(vec2(frame, 9.2)).mul(419).sub(this.seedUniform.mul(9.71))
        )
        const p = pixel.div(this.sizeUniform).add(offset).toVar()
        const rough = this.roughnessUniform

        let sum: Node = vec3(0)
        LATTICES.forEach((angle, index) => {
          const sample = this.lattice(
            rotate(p, angle).add(vec2(index * 37.1, index * 11.7))
          )
          sum = sum.add(vec3(sample.r, sample.g, sample.b))
        })
        const base = sum.sub(1.5).mul(2.7).toVar()
        const fineSample = this.lattice(rotate(p, 1.9).mul(2.2).add(5.3))
        const fine = vec3(fineSample.r, fineSample.g, fineSample.b)
          .sub(0.5)
          .mul(4.7)
        const field = this.lattice(rotate(p, 1.07).mul(0.3).add(71.3)).toVar()
        const clump = mix(
          float(1),
          smoothstep(0.15, 0.85, field.r).mul(1.3).add(0.35),
          this.clumpingUniform
        ).toVar()

        const structure = (coarse: Node, detail: Node): Node => {
          const mixed = coarse
            .mul(float(1).sub(rough.mul(0.3)))
            .add(detail.mul(rough.mul(0.55)))
          const hard = mixed.div(abs(mixed).mul(0.7).add(0.3)).mul(0.75)
          const shaped = mix(mixed, hard, rough.mul(0.6))
          return shaped.sub(abs(shaped).sub(0.7).mul(0.4)).mul(clump)
        }

        const mono = structure(base.x, fine.x)
          .add(field.g.sub(0.5).mul(this.clumpingUniform).mul(1.2))
        const tint = vec3(0).toVar()

        If(this.chromaUniform.greaterThan(0.0001), () => {
          const u = structure(base.y, fine.y)
          const v = structure(base.z, fine.z)
          tint.assign(
            vec3(u, u.mul(-0.2126).sub(v.mul(0.0722)).div(0.7152), v).mul(
              this.chromaUniform.mul(1.4)
            )
          )
        })

        const encoded = pow(max(color, vec3(0)), vec3(1 / 2.2)).toVar()
        const tone = clamp(
          dot(encoded, vec3(0.2126, 0.7152, 0.0722)),
          0,
          1
        ).toVar()
        const distance = tone.sub(this.responseUniform).div(0.6)
        const response = mix(
          float(0.15),
          float(1),
          clamp(float(1).sub(distance.mul(distance)), 0, 1)
        )
        const strength = this.amountUniform.mul(0.09).mul(response)
        const shade = float(1).sub(tone)
        const softLight = tone.mul(shade).mul(4)
        const overlay = min(tone, shade).mul(4)
        const perTone = select(
          this.blendUniform.lessThan(0.5),
          shade.mul(4),
          min(float(1), shade.div(max(tone, float(0.0001)))).mul(4)
        )
        const additive = this.blendUniform.greaterThan(1.5)
        const gain = select(
          additive,
          float(1),
          select(this.blendUniform.lessThan(0.5), softLight, overlay)
        )
        const lift = mono.mul(strength)
        const scaled = encoded.mul(
          select(additive, float(1), float(1).add(lift.mul(perTone)))
        )
        const lifted = max(
          scaled.add(select(additive, lift, float(0))),
          vec3(0)
        )
        const chromaShift = tint.mul(strength).mul(gain)
        const headroom = (channel: Node, shift: Node): Node =>
          select(shift.lessThan(0), channel.div(shift.negate()), float(1))
        const chromaScale = clamp(
          min(
            min(
              headroom(lifted.x, chromaShift.x),
              headroom(lifted.y, chromaShift.y)
            ),
            headroom(lifted.z, chromaShift.z)
          ),
          0,
          1
        )
        const grained = lifted.add(chromaShift.mul(chromaScale))
        color.assign(pow(grained, vec3(2.2)))
      })

      return vec4(color, float(1))
    })()
  }

  override dispose(): void {
    this.noise.dispose()
    this.placeholder.dispose()
    super.dispose()
  }
}
