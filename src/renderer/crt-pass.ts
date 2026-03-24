import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  abs,
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  mod,
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
import { simplexNoise3d } from "@/renderer/shaders/tsl/noise/simplex-noise-3d"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const CRT_MODE_SLOT_MASK = 0
const CRT_MODE_APERTURE_GRILLE = 1
const CRT_MODE_COMPOSITE_TV = 2

const HISTORY_TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toModeValue(value: unknown): number {
  switch (value) {
    case "aperture-grille":
      return CRT_MODE_APERTURE_GRILLE
    case "composite-tv":
      return CRT_MODE_COMPOSITE_TV
    default:
      return CRT_MODE_SLOT_MASK
  }
}

export class CrtPass extends PassNode {
  private bloomEnabled = true
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  private readonly crtModeUniform: Node
  private readonly cellSizeUniform: Node
  private readonly scanlineIntensityUniform: Node
  private readonly maskIntensityUniform: Node
  private readonly barrelDistortionUniform: Node
  private readonly chromaticAberrationUniform: Node
  private readonly beamFocusUniform: Node
  private readonly brightnessUniform: Node
  private readonly highlightDriveUniform: Node
  private readonly highlightThresholdUniform: Node
  private readonly shoulderUniform: Node
  private readonly chromaRetentionUniform: Node
  private readonly shadowLiftUniform: Node
  private readonly persistenceUniform: Node
  private readonly vignetteIntensityUniform: Node
  private readonly flickerIntensityUniform: Node
  private readonly glitchIntensityUniform: Node
  private readonly glitchSpeedUniform: Node
  private readonly signalArtifactsUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node
  private readonly timeUniform: Node

  private readonly placeholder: THREE.Texture
  private historyReadTarget: THREE.WebGLRenderTarget
  private historyWriteTarget: THREE.WebGLRenderTarget
  private historyValid = false

  private sourceTextureNodes: Node[] = []
  private historyTextureNodes: Node[] = []
  private renderWidth = 1
  private renderHeight = 1

  constructor(layerId: string) {
    super(layerId)

    this.placeholder = new THREE.Texture()
    this.historyReadTarget = new THREE.WebGLRenderTarget(1, 1, HISTORY_TARGET_OPTIONS)
    this.historyWriteTarget = new THREE.WebGLRenderTarget(1, 1, HISTORY_TARGET_OPTIONS)

    this.crtModeUniform = uniform(CRT_MODE_SLOT_MASK)
    this.cellSizeUniform = uniform(3)
    this.scanlineIntensityUniform = uniform(0.17)
    this.maskIntensityUniform = uniform(1)
    this.barrelDistortionUniform = uniform(0.15)
    this.chromaticAberrationUniform = uniform(2)
    this.beamFocusUniform = uniform(0.58)
    this.brightnessUniform = uniform(1.8)
    this.highlightDriveUniform = uniform(1)
    this.highlightThresholdUniform = uniform(0.62)
    this.shoulderUniform = uniform(0.25)
    this.chromaRetentionUniform = uniform(1.15)
    this.shadowLiftUniform = uniform(0.16)
    this.persistenceUniform = uniform(0.18)
    this.vignetteIntensityUniform = uniform(0.45)
    this.flickerIntensityUniform = uniform(0.2)
    this.glitchIntensityUniform = uniform(0.13)
    this.glitchSpeedUniform = uniform(5)
    this.signalArtifactsUniform = uniform(0.45)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.timeUniform = uniform(0)

    this.bloomIntensityUniform = uniform(1.93)
    this.bloomRadiusUniform = uniform(8)
    this.bloomSoftnessUniform = uniform(0.31)
    this.bloomThresholdUniform = uniform(0)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    this.inputNode.value = inputTexture

    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }

    const historyTexture = this.historyValid ? this.historyReadTarget.texture : this.placeholder
    for (const node of this.historyTextureNodes) {
      node.value = historyTexture
    }

    this.beforeRender(time, delta)

    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)

    renderer.setRenderTarget(this.historyWriteTarget)
    renderer.render(this.scene, this.camera)

    const previousRead = this.historyReadTarget
    this.historyReadTarget = this.historyWriteTarget
    this.historyWriteTarget = previousRead
    this.historyValid = true
  }

  protected override beforeRender(time: number, _delta: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    const modeValue = this.crtModeUniform.value as number
    return (
      (this.flickerIntensityUniform.value as number) > 0 ||
      (this.glitchIntensityUniform.value as number) > 0 ||
      (this.persistenceUniform.value as number) > 0 ||
      (modeValue === CRT_MODE_COMPOSITE_TV &&
        (this.signalArtifactsUniform.value as number) > 0)
    )
  }

  override updateParams(params: LayerParameterValues): void {
    this.crtModeUniform.value = toModeValue(params.crtMode)
    this.cellSizeUniform.value =
      typeof params.cellSize === "number" ? Math.max(2, params.cellSize) : 3
    this.scanlineIntensityUniform.value =
      typeof params.scanlineIntensity === "number" ? clamp01(params.scanlineIntensity) : 0.17
    this.maskIntensityUniform.value =
      typeof params.maskIntensity === "number" ? clamp01(params.maskIntensity) : 1
    this.barrelDistortionUniform.value =
      typeof params.barrelDistortion === "number"
        ? Math.max(0, Math.min(0.3, params.barrelDistortion))
        : 0.15
    this.chromaticAberrationUniform.value =
      typeof params.chromaticAberration === "number"
        ? Math.max(0, Math.min(2, params.chromaticAberration))
        : 2
    this.beamFocusUniform.value =
      typeof params.beamFocus === "number" ? clamp01(params.beamFocus) : 0.58
    this.brightnessUniform.value =
      typeof params.brightness === "number"
        ? Math.max(0.5, params.brightness)
        : 1.8
    this.highlightDriveUniform.value =
      typeof params.highlightDrive === "number"
        ? Math.max(1, params.highlightDrive)
        : 1
    this.highlightThresholdUniform.value =
      typeof params.highlightThreshold === "number"
        ? clamp01(params.highlightThreshold)
        : 0.62
    this.shoulderUniform.value =
      typeof params.shoulder === "number" ? Math.max(0, params.shoulder) : 0.25
    this.chromaRetentionUniform.value =
      typeof params.chromaRetention === "number"
        ? Math.max(0, Math.min(2, params.chromaRetention))
        : 1.15
    this.shadowLiftUniform.value =
      typeof params.shadowLift === "number" ? clamp01(params.shadowLift) : 0.16
    this.persistenceUniform.value =
      typeof params.persistence === "number" ? clamp01(params.persistence) : 0.18
    this.vignetteIntensityUniform.value =
      typeof params.vignetteIntensity === "number" ? clamp01(params.vignetteIntensity) : 0.45
    this.flickerIntensityUniform.value =
      typeof params.flickerIntensity === "number"
        ? Math.max(0, Math.min(0.2, params.flickerIntensity))
        : 0.03
    this.glitchIntensityUniform.value =
      typeof params.glitchIntensity === "number" ? clamp01(params.glitchIntensity) : 0
    this.glitchSpeedUniform.value =
      typeof params.glitchSpeed === "number"
        ? Math.max(0.1, Math.min(5, params.glitchSpeed))
        : 1
    this.signalArtifactsUniform.value =
      typeof params.signalArtifacts === "number" ? clamp01(params.signalArtifacts) : 0.45

    const nextBloomEnabled = params.bloomEnabled !== false
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number" ? Math.max(0, params.bloomIntensity) : 1.5
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number" ? clamp01(params.bloomThreshold) : 0.4
    const nextBloomRadius =
      typeof params.bloomRadius === "number" ? Math.max(0, params.bloomRadius) : 8
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number" ? clamp01(params.bloomSoftness) : 0.4

    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
      return
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(nextBloomSoftness)
    }
  }

  override resize(width: number, height: number): void {
    this.renderWidth = Math.max(1, width)
    this.renderHeight = Math.max(1, height)
    this.widthUniform.value = this.renderWidth
    this.heightUniform.value = this.renderHeight
    this.historyReadTarget.setSize(this.renderWidth, this.renderHeight)
    this.historyWriteTarget.setSize(this.renderWidth, this.renderHeight)
    this.historyValid = false
  }

  override updateLogicalSize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.placeholder.dispose()
    this.historyReadTarget.dispose()
    this.historyWriteTarget.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!(this.cellSizeUniform && this.placeholder)) {
      return this.inputNode
    }

    this.disposeBloomNode()
    this.bloomNode = null
    this.sourceTextureNodes = []
    this.historyTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const dims = vec2(this.widthUniform, this.heightUniform)
    const texel = vec2(
      float(1).div(max(this.widthUniform, float(1))),
      float(1).div(max(this.heightUniform, float(1))),
    )
    const centered = renderTargetUv.sub(vec2(0.5, 0.5))
    const distSq = dot(centered, centered)

    const slotWeight = this.modeWeight(CRT_MODE_SLOT_MASK)
    const apertureWeight = this.modeWeight(CRT_MODE_APERTURE_GRILLE)
    const compositeWeight = this.modeWeight(CRT_MODE_COMPOSITE_TV)

    const distortionBias = slotWeight
      .mul(1)
      .add(apertureWeight.mul(0.72))
      .add(compositeWeight.mul(1.16))
    const distortedUv = renderTargetUv.add(
      centered.mul(distSq).mul(this.barrelDistortionUniform).mul(distortionBias),
    )

    const insideScreen = distortedUv.x
      .greaterThanEqual(float(0))
      .and(distortedUv.x.lessThanEqual(float(1)))
      .and(distortedUv.y.greaterThanEqual(float(0)))
      .and(distortedUv.y.lessThanEqual(float(1)))

    const pitch = max(this.cellSizeUniform, float(2))
    const screenPixel = renderTargetUv.mul(dims)
    const cellCoord = floor(screenPixel.div(pitch))
    const localCellUv = vec2(
      fract(screenPixel.x.div(pitch)),
      fract(screenPixel.y.div(pitch)),
    )
    const cellCenterUv = cellCoord.add(vec2(0.5, 0.5)).mul(pitch).div(dims)
    const centeredCell = cellCenterUv.sub(vec2(0.5, 0.5))
    const cellDistSq = dot(centeredCell, centeredCell)
    const distortedCellUv = cellCenterUv.add(
      centeredCell.mul(cellDistSq).mul(this.barrelDistortionUniform).mul(distortionBias),
    )
    const row = cellCoord.y
    const timeDrift = this.timeUniform.mul(this.glitchSpeedUniform)
    const drift = simplexNoise3d(vec3(float(0), row.mul(float(0.1)), timeDrift))
      .mul(this.glitchIntensityUniform)
      .mul(slotWeight.mul(0.003).add(compositeWeight.mul(0.007)).add(apertureWeight.mul(0.0025)))
    const samplingUv = vec2(distortedCellUv.x.add(drift), distortedCellUv.y)
    const clampedSamplingUv = clamp(samplingUv, vec2(0, 0), vec2(1, 1))

    const baseSignal = this.sampleSignalColor(clampedSamplingUv, texel, compositeWeight)
    const baseLuma = this.luma(baseSignal)
    const brightnessSpread = mix(
      float(0.82),
      float(1.34),
      smoothstep(float(0.12), float(0.95), baseLuma),
    )

    const beamWidthX = mix(float(1.6), float(0.58), this.beamFocusUniform)
      .mul(brightnessSpread.mul(float(0.15)).add(float(0.92)))
      .mul(
        slotWeight.mul(1)
          .add(apertureWeight.mul(0.72))
          .add(compositeWeight.mul(1.4)),
      )
    const beamWidthY = mix(float(1.95), float(0.62), this.beamFocusUniform)
      .mul(mix(float(1.12), float(0.46), this.scanlineIntensityUniform))
      .mul(brightnessSpread)
      .mul(
        slotWeight.mul(1)
          .add(apertureWeight.mul(0.84))
          .add(compositeWeight.mul(1.3)),
      )

    const edgeFactor = pow(clamp(centered.length().mul(float(1.82)), float(0), float(1)), float(2))
    const convergenceShape = vec2(
      centered.x.mul(abs(centered.x).add(float(0.16))),
      centered.y.mul(abs(centered.y).add(float(0.08))),
    )
    const convergenceScale = this.chromaticAberrationUniform
      .mul(edgeFactor)
      .mul(slotWeight.mul(1).add(apertureWeight.mul(0.82)).add(compositeWeight.mul(1.18)))
      .div(dims)
      .mul(float(1.6))
    const convergenceOffset = convergenceShape.mul(convergenceScale)
    const greenOffset = vec2(float(0), convergenceScale.y.mul(float(-0.2)))

    const redBeam = this.sampleBeamColor(
      clamp(clampedSamplingUv.add(convergenceOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      beamWidthX,
      beamWidthY,
      compositeWeight,
    )
    const greenBeam = this.sampleBeamColor(
      clamp(clampedSamplingUv.add(greenOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      beamWidthX,
      beamWidthY,
      compositeWeight,
    )
    const blueBeam = this.sampleBeamColor(
      clamp(clampedSamplingUv.sub(convergenceOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      beamWidthX,
      beamWidthY,
      compositeWeight,
    )

    const beamEnergy = vec3(float(redBeam.r), float(greenBeam.g), float(blueBeam.b))
    const feedResponse = this.buildFeedResponse(
      beamEnergy,
      cellCoord,
      slotWeight,
      apertureWeight,
      compositeWeight,
    )
    const scanlineEnvelope = this.buildScanlineEnvelope(screenPixel, baseLuma, compositeWeight)

    const halationSignal = this.sampleHalation(clampedSamplingUv, texel, compositeWeight)
    const halation = vec3(
      float(halationSignal.r),
      float(halationSignal.g),
      float(halationSignal.b),
    ).mul(
      smoothstep(float(0.45), float(1), baseLuma).mul(
        slotWeight.mul(0.04).add(apertureWeight.mul(0.03)).add(compositeWeight.mul(0.07)),
      ),
    )

    let color = this.renderPhosphorCell(
      localCellUv,
      cellCoord,
      beamEnergy,
      baseLuma,
      feedResponse,
      slotWeight,
      apertureWeight,
      compositeWeight,
    )
    const tubeGlow = this.buildTubeGlow(
      localCellUv,
      baseSignal,
      baseLuma,
      slotWeight,
      apertureWeight,
      compositeWeight,
    )
    const specularLift = this.buildSpecularLift(
      localCellUv,
      baseSignal,
      baseLuma,
      slotWeight,
      apertureWeight,
      compositeWeight,
    )
    color = color.mul(mix(vec3(1, 1, 1), scanlineEnvelope, this.scanlineIntensityUniform))
    color = color.add(halation).add(tubeGlow).add(specularLift)

    const vignetteStrength = this.vignetteIntensityUniform.mul(
      slotWeight.mul(1).add(apertureWeight.mul(0.82)).add(compositeWeight.mul(1.1)),
    )
    const vignetteDistance = centered.length().mul(float(2))
    const vignette = clamp(
      float(1).sub(vignetteDistance.mul(vignetteDistance).mul(vignetteStrength)),
      float(0),
      float(1),
    )
    color = color.mul(vignette)

    const flickerNoise = simplexNoise3d(vec3(float(0), float(0), this.timeUniform.mul(float(8))))
    const flicker = float(1).add(flickerNoise.mul(this.flickerIntensityUniform))
    color = color.mul(flicker)
    color = color.mul(select(insideScreen, float(1), float(0)))

    const historySample = this.trackHistoryTextureNode(renderTargetUv)
    const historyColor = vec3(
      float(historySample.r),
      float(historySample.g),
      float(historySample.b),
    )
    const historyDecay = historyColor.mul(
      vec3(
        mix(float(0.62), float(0.92), this.persistenceUniform),
        mix(float(0.68), float(0.96), this.persistenceUniform),
        mix(float(0.56), float(0.88), this.persistenceUniform),
      ),
    )
    color = clamp(
      color.add(historyDecay.mul(this.persistenceUniform).mul(float(0.55))),
      vec3(0, 0, 0),
      vec3(1, 1, 1),
    )

    if (!this.bloomEnabled) {
      return vec4(color, float(1))
    }

    const bloomInput = vec4(color, float(1))
    this.bloomNode = bloom(
      bloomInput,
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number,
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number,
    )

    return vec4(
      clamp(
        color.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      ),
      float(1),
    )
  }

  private buildBand(position: Node, center: Node | number, halfWidth: Node | number, softEdge: Node | number): Node {
    const bandCenter = this.toNode(center)
    const halfWidthNode = this.toNode(halfWidth)
    const softEdgeNode = this.toNode(softEdge)
    const low = bandCenter.sub(halfWidthNode)
    const high = bandCenter.add(halfWidthNode)
    return smoothstep(low.sub(softEdgeNode), low, position).mul(
      float(1).sub(smoothstep(high, high.add(softEdgeNode), position)),
    )
  }

  private buildRoundedPhosphor(
    localX: Node,
    localY: Node,
    centerX: Node | number,
    halfWidth: Node | number,
    halfHeight: Node | number,
    softEdge: Node | number,
    taper: Node | number,
  ): Node {
    const halfHeightNode = this.toNode(halfHeight)
    const softEdgeNode = this.toNode(softEdge)
    const taperNode = this.toNode(taper)
    const yDistance = abs(localY.sub(float(0.5)))
    const widthTaper = mix(
      float(1),
      taperNode,
      smoothstep(halfHeightNode.mul(0.42), float(0.5), yDistance),
    )
    return this.buildBand(localX, centerX, this.toNode(halfWidth).mul(widthTaper), softEdgeNode).mul(
      this.buildBand(localY, 0.5, halfHeightNode, softEdgeNode),
    )
  }

  private buildFeedResponse(
    beamEnergy: Node,
    cellCoord: Node,
    slotWeight: Node,
    apertureWeight: Node,
    compositeWeight: Node,
  ): Node {
    const feedMax = max(float(beamEnergy.r), max(float(beamEnergy.g), float(beamEnergy.b)))
    const safeFeedMax = max(feedMax, float(1e-4))
    const channelSeparation = slotWeight.mul(0.86).add(apertureWeight.mul(0.78)).add(compositeWeight.mul(0.58))
    const responseCurve = slotWeight.mul(0.92).add(apertureWeight.mul(0.88)).add(compositeWeight.mul(1.04))
    const spill = compositeWeight.mul(0.12).add(slotWeight.mul(0.04)).add(apertureWeight.mul(0.03))

    const rNoise = simplexNoise3d(vec3(cellCoord.x.add(float(0.19)), cellCoord.y, float(7.1)))
      .mul(0.5)
      .add(0.5)
    const gNoise = simplexNoise3d(vec3(cellCoord.x.add(float(0.41)), cellCoord.y, float(13.7)))
      .mul(0.5)
      .add(0.5)
    const bNoise = simplexNoise3d(vec3(cellCoord.x.add(float(0.73)), cellCoord.y, float(19.9)))
      .mul(0.5)
      .add(0.5)

    const rResponse = mix(float(0.82), float(1.18), rNoise)
    const gResponse = mix(float(0.84), float(1.16), gNoise)
    const bResponse = mix(float(0.8), float(1.2), bNoise)

    const rDominance = pow(clamp(float(beamEnergy.r).div(safeFeedMax), float(0), float(1)), float(0.82))
    const gDominance = pow(clamp(float(beamEnergy.g).div(safeFeedMax), float(0), float(1)), float(0.82))
    const bDominance = pow(clamp(float(beamEnergy.b).div(safeFeedMax), float(0), float(1)), float(0.82))

    const rDrive = clamp(
      beamEnergy.r.mul(rResponse).mul(mix(float(1), rDominance, channelSeparation)).add(feedMax.mul(spill)),
      float(0),
      float(1),
    )
    const gDrive = clamp(
      beamEnergy.g.mul(gResponse).mul(mix(float(1), gDominance, channelSeparation)).add(feedMax.mul(spill)),
      float(0),
      float(1),
    )
    const bDrive = clamp(
      beamEnergy.b.mul(bResponse).mul(mix(float(1), bDominance, channelSeparation)).add(feedMax.mul(spill)),
      float(0),
      float(1),
    )

    return clamp(
      vec3(
        pow(rDrive, responseCurve),
        pow(gDrive, responseCurve),
        pow(bDrive, responseCurve),
      ),
      vec3(0, 0, 0),
      vec3(1, 1, 1),
    )
  }

  private renderPhosphorCell(
    localCellUv: Node,
    cellCoord: Node,
    beamEnergy: Node,
    baseLuma: Node,
    feedResponse: Node,
    slotWeight: Node,
    apertureWeight: Node,
    compositeWeight: Node,
  ): Node {
    const rowIndex = cellCoord.y
    const oddRow = mod(rowIndex, float(2)).greaterThan(float(0.5))
    const slotX = fract(localCellUv.x.add(select(oddRow, float(0.5), float(0))))
    const slotY = localCellUv.y

    const definition = mix(float(0.72), float(1.18), this.maskIntensityUniform)
    const rowJitter = simplexNoise3d(vec3(float(0), rowIndex, float(3.7))).mul(0.5).add(0.5).sub(0.5)
    const slotJitter = simplexNoise3d(vec3(cellCoord.x, cellCoord.y, float(9.3))).mul(0.5).add(0.5).sub(0.5)
    const apertureJitter = simplexNoise3d(vec3(cellCoord.x, cellCoord.y, float(15.1)))
      .mul(0.5)
      .add(0.5)
      .sub(0.5)
    const tvJitter = simplexNoise3d(vec3(cellCoord.x, cellCoord.y, float(21.4))).mul(0.5).add(0.5).sub(0.5)

    const slotShape = vec3(
      this.buildRoundedPhosphor(
        slotX,
        slotY,
        float(1 / 6).sub(rowJitter.mul(0.01)),
        float(0.12).mul(definition).add(slotJitter.mul(0.01)),
        float(0.38).add(abs(slotJitter).mul(0.03)),
        float(0.015),
        float(0.38),
      ),
      this.buildRoundedPhosphor(
        slotX,
        slotY,
        float(0.5),
        float(0.115).mul(definition).add(slotJitter.mul(0.008)),
        float(0.38).add(abs(slotJitter).mul(0.03)),
        float(0.015),
        float(0.38),
      ),
      this.buildRoundedPhosphor(
        slotX,
        slotY,
        float(5 / 6).add(rowJitter.mul(0.01)),
        float(0.12).mul(definition).add(slotJitter.mul(0.01)),
        float(0.38).add(abs(slotJitter).mul(0.03)),
        float(0.015),
        float(0.38),
      ),
    )

    const apertureX = localCellUv.x
    const apertureSegment = this.buildBand(slotY, 0.5, float(0.41), float(0.06))
    const apertureShape = vec3(
      this.buildRoundedPhosphor(
        apertureX,
        slotY,
        float(1 / 6).add(apertureJitter.mul(0.007)),
        float(0.14).mul(definition).add(apertureJitter.mul(0.008)),
        float(0.44),
        float(0.008),
        float(0.82),
      ).mul(apertureSegment),
      this.buildRoundedPhosphor(
        apertureX,
        slotY,
        float(0.5),
        float(0.135).mul(definition).add(apertureJitter.mul(0.006)),
        float(0.44),
        float(0.008),
        float(0.82),
      ).mul(apertureSegment),
      this.buildRoundedPhosphor(
        apertureX,
        slotY,
        float(5 / 6).sub(apertureJitter.mul(0.007)),
        float(0.14).mul(definition).add(apertureJitter.mul(0.008)),
        float(0.44),
        float(0.008),
        float(0.82),
      ).mul(apertureSegment),
    )

    const tvX = fract(localCellUv.x.add(select(oddRow, float(0.25), float(0))))
    const tvShape = vec3(
      this.buildRoundedPhosphor(
        tvX,
        slotY,
        float(1 / 6).add(tvJitter.mul(0.015)),
        float(0.11).mul(definition).add(tvJitter.mul(0.012)),
        float(0.34).add(abs(tvJitter).mul(0.04)),
        float(0.02),
        float(0.44),
      ),
      this.buildRoundedPhosphor(
        tvX,
        slotY,
        float(0.5),
        float(0.105).mul(definition).add(tvJitter.mul(0.01)),
        float(0.34).add(abs(tvJitter).mul(0.04)),
        float(0.02),
        float(0.44),
      ),
      this.buildRoundedPhosphor(
        tvX,
        slotY,
        float(5 / 6).sub(tvJitter.mul(0.015)),
        float(0.11).mul(definition).add(tvJitter.mul(0.012)),
        float(0.34).add(abs(tvJitter).mul(0.04)),
        float(0.02),
        float(0.44),
      ),
    )

    const combinedShape = slotShape.mul(slotWeight)
      .add(apertureShape.mul(apertureWeight))
      .add(tvShape.mul(compositeWeight))

    const channelResponse = vec3(
      beamEnergy.r.mul(feedResponse.r),
      beamEnergy.g.mul(feedResponse.g),
      beamEnergy.b.mul(feedResponse.b),
    )
    const responseLuma = this.luma(channelResponse)
    const responseNeutral = vec3(responseLuma, responseLuma, responseLuma)
    const responseChroma = channelResponse.sub(responseNeutral)
    const highlightMask = smoothstep(this.highlightThresholdUniform, float(1), baseLuma)
    const brightnessGain = mix(
      float(1),
      this.brightnessUniform,
      smoothstep(float(0.22), float(0.98), baseLuma),
    )
    const lumaDrive = brightnessGain.mul(
      mix(float(1), this.highlightDriveUniform, highlightMask),
    )
    const shadowGain = mix(
      float(1),
      this.shadowLiftUniform.mul(float(0.35)).add(float(1)),
      smoothstep(float(0.42), float(0.02), baseLuma),
    )
    const drivenLuma = responseLuma.mul(lumaDrive).mul(shadowGain)
    const shoulderStrength = this.shoulderUniform.mul(highlightMask).mul(float(0.15))
    const compressedLuma = drivenLuma.div(
      drivenLuma.mul(shoulderStrength).add(float(1)),
    )
    const shapedLuma = mix(
      drivenLuma,
      compressedLuma,
      smoothstep(float(0.05), float(1), highlightMask),
    )
    const chromaGain = mix(
      float(1),
      this.chromaRetentionUniform.mul(mix(float(1), lumaDrive, float(0.18))),
      smoothstep(float(0.18), float(0.95), baseLuma),
    )
    const boostedResponse = vec3(shapedLuma, shapedLuma, shapedLuma).add(
      responseChroma.mul(chromaGain),
    )
    const phosphorBrightness = slotWeight.mul(2.8).add(apertureWeight.mul(2.4)).add(compositeWeight.mul(2.6))
    const baseEmission = vec3(
      combinedShape.r.mul(boostedResponse.r),
      combinedShape.g.mul(boostedResponse.g),
      combinedShape.b.mul(boostedResponse.b),
    ).mul(phosphorBrightness)
    const channelMin = min(boostedResponse.r, min(boostedResponse.g, boostedResponse.b))
    const channelMax = max(boostedResponse.r, max(boostedResponse.g, boostedResponse.b))
    const channelAvg = boostedResponse.r.add(boostedResponse.g).add(boostedResponse.b).div(3)
    const sharedDrive = clamp(channelAvg.div(max(channelMax, float(1e-4))), float(0), float(1))
    const neutrality = clamp(channelMin.div(max(channelMax, float(1e-4))), float(0), float(1))
    const whiteHot = smoothstep(float(0.24), float(0.82), channelAvg).mul(
      smoothstep(float(0.55), float(0.96), neutrality),
    ).mul(
      mix(float(0.03), float(0.18), pow(sharedDrive, float(0.72))),
    )
    const sharedCore = combinedShape.add(vec3(channelMin, channelMin, channelMin)).div(4)
    const whiteCore = vec3(whiteHot, whiteHot, whiteHot).mul(sharedCore).mul(
      slotWeight.mul(0.34).add(apertureWeight.mul(0.28)).add(compositeWeight.mul(0.46)),
    ).mul(mix(float(1), lumaDrive, smoothstep(float(0.52), float(1), channelAvg)))

    return clamp(
      baseEmission.add(whiteCore),
      vec3(0, 0, 0),
      vec3(1, 1, 1),
    )
  }

  private buildTubeGlow(
    localCellUv: Node,
    baseSignal: Node,
    baseLuma: Node,
    slotWeight: Node,
    apertureWeight: Node,
    compositeWeight: Node,
  ): Node {
    const channelMax = max(baseSignal.r, max(baseSignal.g, baseSignal.b))
    const channelMin = min(baseSignal.r, min(baseSignal.g, baseSignal.b))
    const neutrality = clamp(channelMin.div(max(channelMax, float(1e-4))), float(0), float(1))
    const highlightMix = smoothstep(float(0.58), float(0.98), channelMax)
    const whiteness = smoothstep(float(0.55), float(0.94), baseLuma).mul(
      smoothstep(float(0.62), float(0.98), neutrality),
    ).mul(
      mix(float(0.04), float(0.18), highlightMix),
    )
    const neutral = vec3(baseLuma, baseLuma, baseLuma)
    const warmedNeutral = mix(
      neutral,
      vec3(baseLuma.mul(1.03), baseLuma.mul(0.99), baseLuma.mul(0.96)),
      slotWeight.mul(0.18).add(compositeWeight.mul(0.28)),
    )
    const neutralMix = whiteness.mul(
      mix(
        float(1),
        float(0.55),
        clamp(this.chromaRetentionUniform.sub(float(1)), float(0), float(1)),
      ),
    )
    const drivenSignal = mix(baseSignal, warmedNeutral, neutralMix)
    const centerDistance = localCellUv.sub(vec2(0.5, 0.5)).length()
    const spread = smoothstep(float(0.42), float(0.18), centerDistance)
    const glowStrength = highlightMix.mul(baseLuma).mul(
      slotWeight.mul(0.04).add(apertureWeight.mul(0.03)).add(compositeWeight.mul(0.08)),
    )
    return drivenSignal.mul(spread).mul(glowStrength)
  }

  private buildSpecularLift(
    localCellUv: Node,
    baseSignal: Node,
    baseLuma: Node,
    slotWeight: Node,
    apertureWeight: Node,
    compositeWeight: Node,
  ): Node {
    const channelMax = max(baseSignal.r, max(baseSignal.g, baseSignal.b))
    const channelMin = min(baseSignal.r, min(baseSignal.g, baseSignal.b))
    const neutrality = clamp(channelMin.div(max(channelMax, float(1e-4))), float(0), float(1))
    const highlightGate = smoothstep(float(0.62), float(0.98), channelMax)
      .mul(smoothstep(float(0.42), float(0.92), baseLuma))
    const coreDistance = localCellUv.sub(vec2(0.5, 0.5)).length()
    const core = smoothstep(float(0.44), float(0.02), coreDistance)
    const liftStrength = highlightGate.mul(
      mix(float(0.32), float(0.9), neutrality)
    ).mul(
      slotWeight.mul(0.95).add(apertureWeight.mul(0.78)).add(compositeWeight.mul(1.08)),
    )
    const neutralLift = mix(baseSignal, vec3(channelMax, channelMax, channelMax), float(0.86))
    return neutralLift.mul(core).mul(liftStrength)
  }

  private buildScanlineEnvelope(screenPixel: Node, luma: Node, compositeWeight: Node): Node {
    const pitch = max(this.cellSizeUniform, float(2))
    const localY = fract(screenPixel.y.div(pitch))
    const halfWidth = mix(float(0.48), float(0.21), this.scanlineIntensityUniform)
      .mul(mix(float(0.82), float(1.18), smoothstep(float(0.08), float(1), luma)))
      .mul(mix(float(1), float(1.12), compositeWeight))
    const envelope = this.buildBand(localY, 0.5, halfWidth, 0.12)
    return vec3(envelope, envelope, envelope)
  }

  private luma(color: Node): Node {
    return dot(color, vec3(0.2126, 0.7152, 0.0722))
  }

  private modeWeight(targetMode: number): Node {
    return select(this.crtModeUniform.equal(float(targetMode)), float(1), float(0))
  }

  private toNode(value: Node | number): Node {
    return typeof value === "number" ? float(value) : value
  }

  private normalizeBloomRadius(value: number): number {
    return clamp01(value / 24)
  }

  private normalizeBloomSoftness(value: number): number {
    return Math.max(0.001, value * 0.25)
  }

  private disposeBloomNode(): void {
    ;(this.bloomNode as { dispose?: () => void } | null)?.dispose?.()
  }

  private getBloomTextureNode(): Node {
    const bloomNode = this.bloomNode as
      | ({
          getTexture?: () => Node
          getTextureNode?: () => Node
        } & object)
      | null

    if (!bloomNode) {
      throw new Error("Bloom node is not initialized")
    }

    if ("getTextureNode" in bloomNode && typeof bloomNode.getTextureNode === "function") {
      return bloomNode.getTextureNode()
    }

    if ("getTexture" in bloomNode && typeof bloomNode.getTexture === "function") {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }

  private sampleBeamColor(
    sampleUv: Node,
    texel: Node,
    beamWidthX: Node,
    beamWidthY: Node,
    compositeWeight: Node,
  ): Node {
    const xOffset = vec2(texel.x.mul(beamWidthX), float(0))
    const yOffset = vec2(float(0), texel.y.mul(beamWidthY))

    const center = this.sampleSignalColor(sampleUv, texel, compositeWeight)
    const left = this.sampleSignalColor(
      clamp(sampleUv.sub(xOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const right = this.sampleSignalColor(
      clamp(sampleUv.add(xOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const up = this.sampleSignalColor(
      clamp(sampleUv.sub(yOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const down = this.sampleSignalColor(
      clamp(sampleUv.add(yOffset), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )

    return center.mul(0.42)
      .add(left.add(right).mul(0.2))
      .add(up.add(down).mul(0.09))
  }

  private sampleHalation(sampleUv: Node, texel: Node, compositeWeight: Node): Node {
    const haloX = vec2(texel.x.mul(2.2), float(0))
    const haloY = vec2(float(0), texel.y.mul(1.6))
    const left = this.sampleSignalColor(
      clamp(sampleUv.sub(haloX), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const right = this.sampleSignalColor(
      clamp(sampleUv.add(haloX), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const up = this.sampleSignalColor(
      clamp(sampleUv.sub(haloY), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    const down = this.sampleSignalColor(
      clamp(sampleUv.add(haloY), vec2(0, 0), vec2(1, 1)),
      texel,
      compositeWeight,
    )
    return left.add(right).add(up).add(down).mul(0.25)
  }

  private sampleSignalColor(sampleUv: Node, texel: Node, compositeWeight: Node): Node {
    const sampleOffset = vec2(texel.x.mul(1.35), float(0))
    const center = this.trackSourceTextureNode(sampleUv)
    const left = this.trackSourceTextureNode(
      clamp(sampleUv.sub(sampleOffset), vec2(0, 0), vec2(1, 1)),
    )
    const right = this.trackSourceTextureNode(
      clamp(sampleUv.add(sampleOffset), vec2(0, 0), vec2(1, 1)),
    )

    const centerColor = vec3(float(center.r), float(center.g), float(center.b))
    const leftColor = vec3(float(left.r), float(left.g), float(left.b))
    const rightColor = vec3(float(right.r), float(right.g), float(right.b))
    const avgColor = centerColor.mul(2).add(leftColor).add(rightColor).div(4)

    const lumaCenter = this.luma(centerColor)
    const lumaAvg = this.luma(avgColor)
    const chromaBlur = avgColor.sub(vec3(lumaAvg, lumaAvg, lumaAvg))
    const lumaSignal = vec3(
      mix(lumaCenter, lumaAvg, this.signalArtifactsUniform.mul(0.28)),
      mix(lumaCenter, lumaAvg, this.signalArtifactsUniform.mul(0.28)),
      mix(lumaCenter, lumaAvg, this.signalArtifactsUniform.mul(0.28)),
    )
    const ringing = centerColor.sub(avgColor).mul(this.signalArtifactsUniform.mul(0.3))
    const compositeColor = clamp(
      lumaSignal.add(chromaBlur.mul(0.92)).add(ringing),
      vec3(0, 0, 0),
      vec3(1, 1, 1),
    )
    const signalColor = mix(centerColor, compositeColor, compositeWeight.mul(this.signalArtifactsUniform))
    const signalLuma = this.luma(signalColor)
    const neutralSignal = vec3(signalLuma, signalLuma, signalLuma)
    const signalChroma = signalColor.sub(neutralSignal)
    const liftedLuma = signalLuma.add(
      smoothstep(float(0.38), float(0.02), signalLuma)
        .mul(this.shadowLiftUniform)
        .mul(float(0.08)),
    )
    return clamp(
      vec3(liftedLuma, liftedLuma, liftedLuma).add(signalChroma),
      vec3(0, 0, 0),
      vec3(1, 1, 1),
    )
  }

  private trackHistoryTextureNode(uvNode: Node): Node {
    const historyTextureNode = tslTexture(this.placeholder, uvNode)
    this.historyTextureNodes.push(historyTextureNode)
    return historyTextureNode
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const sourceTextureNode = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(sourceTextureNode)
    return sourceTextureNode
  }
}
