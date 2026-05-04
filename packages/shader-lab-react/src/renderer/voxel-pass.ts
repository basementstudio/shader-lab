import {
  abs,
  clamp,
  float,
  floor,
  max,
  mix,
  sqrt,
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
import type { ShaderLabLayerConfig } from "../types"
import { createPipelinePlaceholder, PassNode } from "./pass-node"

type Node = TSLNode

const SQRT3 = Math.sqrt(3)
const STACK_LIMIT = 8

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  const color = new THREE.Color(`#${value}`)

  return [color.r, color.g, color.b]
}

function tslRound(value: Node): Node {
  return floor(float(value).add(0.5))
}

export class VoxelPass extends PassNode {
  private readonly cellSizeUniform: Node
  private readonly depthUniform: Node
  private readonly maxHeightUniform: Node
  private readonly topShadeUniform: Node
  private readonly lightShadeUniform: Node
  private readonly darkShadeUniform: Node
  private readonly flipLightUniform: Node
  private readonly outlineWidthUniform: Node
  private readonly outlineColorUniform: Node
  private readonly legoUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node

  private sampleNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)

    this.cellSizeUniform = uniform(24)
    this.depthUniform = uniform(0)
    this.maxHeightUniform = uniform(6)
    this.topShadeUniform = uniform(1.0)
    this.lightShadeUniform = uniform(0.78)
    this.darkShadeUniform = uniform(0.55)
    this.flipLightUniform = uniform(0)
    this.outlineWidthUniform = uniform(1.0)
    const [or, og, ob] = hexToRgb("#0a0a0a")
    this.outlineColorUniform = uniform(new THREE.Vector3(or, og, ob))
    this.legoUniform = uniform(0)
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
    for (const node of this.sampleNodes) {
      node.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: ShaderLabLayerConfig["params"]): void {
    this.cellSizeUniform.value =
      typeof params.cellSize === "number"
        ? Math.max(4, params.cellSize)
        : 24
    this.depthUniform.value =
      typeof params.depth === "number" ? clamp01(params.depth) : 0
    this.maxHeightUniform.value =
      typeof params.maxHeight === "number"
        ? Math.max(1, Math.min(STACK_LIMIT, Math.round(params.maxHeight)))
        : 6
    this.topShadeUniform.value =
      typeof params.topShade === "number" ? params.topShade : 1.0
    this.lightShadeUniform.value =
      typeof params.lightShade === "number" ? params.lightShade : 0.78
    this.darkShadeUniform.value =
      typeof params.darkShade === "number" ? params.darkShade : 0.55
    this.flipLightUniform.value = params.flipLight === true ? 1 : 0
    this.outlineWidthUniform.value =
      typeof params.outlineWidth === "number"
        ? Math.max(0, params.outlineWidth)
        : 1.0
    if (typeof params.outlineColor === "string") {
      const [r, g, b] = hexToRgb(params.outlineColor)
      ;(this.outlineColorUniform.value as THREE.Vector3).set(r, g, b)
    }
    this.legoUniform.value = params.lego === true ? 1 : 0
  }

  protected override buildEffectNode(): Node {
    if (!this.cellSizeUniform) {
      return this.inputNode
    }

    this.sampleNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const logicalSize = vec2(
      this.logicalWidthUniform,
      this.logicalHeightUniform
    )
    const pixCoord = renderTargetUv.mul(logicalSize)
    const s = float(this.cellSizeUniform)
    const stackStep = s

    let bestFound = float(0)
    let bestJ = float(0)
    let bestCenter: Node = vec2(float(0), float(0))
    let bestColor: Node = vec3(float(0), float(0), float(0))

    for (let k = STACK_LIMIT - 1; k >= 0; k--) {
      const j = float(k)
      const probe = vec2(pixCoord.x, pixCoord.y.add(j.mul(stackStep)))
      const center = this.hexCenter(probe, s)
      const sampleUv = center.div(logicalSize)
      const placeholder = createPipelinePlaceholder()
      const sNode = tslTexture(placeholder, sampleUv)
      this.sampleNodes.push(sNode)
      const sampledColor = vec3(
        float(sNode.r),
        float(sNode.g),
        float(sNode.b)
      )
      const luma = float(sNode.r)
        .mul(0.2126)
        .add(float(sNode.g).mul(0.7152))
        .add(float(sNode.b).mul(0.0722))

      const hFlat = float(1)
      const hVary = float(1).add(
        luma.mul(float(this.maxHeightUniform).sub(float(1)))
      )
      const hReal = mix(hFlat, hVary, this.depthUniform)
      const cubeExists = j.lessThan(hReal)
      const notFound = bestFound.lessThan(float(0.5))
      const take = cubeExists.and(notFound)

      bestFound = select(take, float(1), bestFound)
      bestJ = select(take, j, bestJ)
      bestCenter = select(take, center, bestCenter)
      bestColor = select(take, sampledColor, bestColor)
    }

    const cubeCenter = vec2(
      bestCenter.x,
      bestCenter.y.sub(bestJ.mul(stackStep))
    )
    const localP = pixCoord.sub(cubeCenter)
    const lx = localP.x
    const ly = localP.y

    const topThreshold = abs(lx).div(SQRT3).negate()
    const isTop = ly.lessThan(topThreshold)
    const notTop = ly.greaterThanEqual(topThreshold)
    const isRight = notTop.and(lx.greaterThan(float(0)))

    const flip = this.flipLightUniform.greaterThan(float(0.5))
    const sideBright = select(
      flip,
      float(this.darkShadeUniform),
      float(this.lightShadeUniform)
    )
    const sideDark = select(
      flip,
      float(this.lightShadeUniform),
      float(this.darkShadeUniform)
    )

    const cubeFaceShade = select(
      isTop,
      float(this.topShadeUniform),
      select(isRight, sideBright, sideDark)
    )

    const legoOn = this.legoUniform.greaterThan(float(0.5))
    const notchH = s.mul(0.18)
    const notchRx = s.mul(0.4)
    const notchRy = s.mul(0.2)
    const notchBaseY = s.mul(-0.5)
    const notchTopY = notchBaseY.sub(notchH)
    const capDx = lx
    const capDy = ly.sub(notchTopY)
    const capR = capDx.div(notchRx).mul(capDx.div(notchRx)).add(
      capDy.div(notchRy).mul(capDy.div(notchRy))
    )
    const inCap = capR.lessThan(float(1))

    const tNorm = clamp(
      float(1).sub(lx.div(notchRx).mul(lx.div(notchRx))),
      float(0),
      float(1)
    )
    const arc = sqrt(tNorm).mul(notchRy)
    const yTopArc = notchTopY.add(arc)
    const yBaseArc = notchBaseY.add(arc)
    const inSideBand = abs(lx)
      .lessThan(notchRx)
      .and(ly.greaterThanEqual(yTopArc))
      .and(ly.lessThan(yBaseArc))
    const inNotch = legoOn.and(isTop).and(inCap.or(inSideBand))

    const notchCapShade = float(this.topShadeUniform).mul(0.92)
    const sideT = clamp(
      lx.div(notchRx).add(float(1)).mul(0.5),
      float(0),
      float(1)
    )
    const notchSideShade = mix(sideDark, sideBright, sideT)
    const notchFaceShade = select(inCap, notchCapShade, notchSideShade)

    const faceShade = select(inNotch, notchFaceShade, cubeFaceShade)

    const litColor = bestColor.mul(faceShade)

    const inradius = s.mul(SQRT3 * 0.5)
    const proj1 = abs(lx)
    const proj2 = abs(lx.mul(0.5).add(ly.mul(SQRT3 * 0.5)))
    const proj3 = abs(lx.mul(0.5).sub(ly.mul(SQRT3 * 0.5)))
    const dEdge = inradius.sub(max(max(proj1, proj2), proj3))

    const halfW = max(this.outlineWidthUniform, float(0.0001))
    const outlineMask = float(1).sub(
      smoothstep(float(0), halfW, dEdge)
    )

    const outlineColor = vec3(
      this.outlineColorUniform.x,
      this.outlineColorUniform.y,
      this.outlineColorUniform.z
    )
    const finalColor = mix(litColor, outlineColor, outlineMask)

    return vec4(finalColor, float(1))
  }

  private hexCenter(p: Node, s: Node): Node {
    const qf = p.x.mul(SQRT3 / 3).sub(p.y.div(3)).div(s)
    const rf = p.y.mul(2 / 3).div(s)
    const sf = qf.negate().sub(rf)

    const qr = tslRound(qf)
    const rr = tslRound(rf)
    const sr = tslRound(sf)

    const qd = abs(qr.sub(qf))
    const rd = abs(rr.sub(rf))
    const sd = abs(sr.sub(sf))

    const qWins = qd.greaterThan(rd).and(qd.greaterThan(sd))
    const qLoses = qd.lessThanEqual(rd).or(qd.lessThanEqual(sd))
    const rWins = qLoses.and(rd.greaterThan(sd))

    const qFixed = select(qWins, rr.negate().sub(sr), qr)
    const rFixed = select(rWins, qFixed.negate().sub(sr), rr)

    const cx = qFixed.mul(SQRT3).add(rFixed.mul(SQRT3 * 0.5)).mul(s)
    const cy = rFixed.mul(1.5).mul(s)

    return vec2(cx, cy)
  }
}
