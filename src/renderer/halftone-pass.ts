import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  abs,
  clamp,
  cos,
  float,
  floor,
  max,
  min,
  mix,
  screenSize,
  select,
  sin,
  smoothstep,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import { grainTexturePattern } from "@/renderer/shaders/tsl/patterns/grain-texture-pattern"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type HalftoneColorMode = "cmyk" | "custom" | "duotone" | "monochrome" | "source"
type CmykBlendMode = "overprint" | "subtractive"

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

  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ]
}

export class HalftonePass extends PassNode {
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private colorMode: HalftoneColorMode = "cmyk"
  private cmykBlendMode: CmykBlendMode = "subtractive"

  private readonly spacingUniform: Node
  private readonly dotSizeUniform: Node
  private readonly dotMinUniform: Node
  private readonly shapeUniform: Node
  private readonly angleUniform: Node
  private readonly contrastUniform: Node
  private readonly softnessUniform: Node
  private readonly invertUniform: Node

  private readonly inkRedUniform: Node
  private readonly inkGreenUniform: Node
  private readonly inkBlueUniform: Node

  private readonly duotoneLightUniform: Node
  private readonly duotoneDarkUniform: Node

  private readonly customBgColorUniform: Node
  private readonly customColorCountUniform: Node
  private readonly customLuminanceBiasUniform: Node
  private readonly customColor1Uniform: Node
  private readonly customColor2Uniform: Node
  private readonly customColor3Uniform: Node
  private readonly customColor4Uniform: Node
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node

  private readonly cyanAngleUniform: Node
  private readonly magentaAngleUniform: Node
  private readonly yellowAngleUniform: Node
  private readonly keyAngleUniform: Node

  private readonly paperRedUniform: Node
  private readonly paperGreenUniform: Node
  private readonly paperBlueUniform: Node
  private readonly paperGrainUniform: Node
  private readonly gcrUniform: Node
  private readonly registrationUniform: Node

  private readonly inkCyanUniform: Node
  private readonly inkMagentaUniform: Node
  private readonly inkYellowUniform: Node
  private readonly inkKeyUniform: Node

  private readonly dotGainUniform: Node
  private readonly dotMorphUniform: Node

  private sampleNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)

    this.spacingUniform = uniform(5)
    this.dotSizeUniform = uniform(1.0)
    this.dotMinUniform = uniform(0.0)
    this.shapeUniform = uniform(0)
    this.angleUniform = uniform((28 * Math.PI) / 180)
    this.contrastUniform = uniform(1.0)
    this.softnessUniform = uniform(0.25)
    this.invertUniform = uniform(0)

    const [inkR, inkG, inkB] = hexToRgb("#0d1014")
    this.inkRedUniform = uniform(inkR)
    this.inkGreenUniform = uniform(inkG)
    this.inkBlueUniform = uniform(inkB)

    this.duotoneLightUniform = uniform(new THREE.Vector3(0.96, 0.96, 0.94))
    this.duotoneDarkUniform = uniform(new THREE.Vector3(0.11, 0.11, 0.11))

    const [customBgR, customBgG, customBgB] = hexToRgb("#F5F5F0")
    this.customBgColorUniform = uniform(
      new THREE.Vector3(customBgR, customBgG, customBgB)
    )
    this.customColorCountUniform = uniform(4)
    this.customLuminanceBiasUniform = uniform(0)

    const [custom1R, custom1G, custom1B] = hexToRgb("#161616")
    this.customColor1Uniform = uniform(
      new THREE.Vector3(custom1R, custom1G, custom1B)
    )
    const [custom2R, custom2G, custom2B] = hexToRgb("#595959")
    this.customColor2Uniform = uniform(
      new THREE.Vector3(custom2R, custom2G, custom2B)
    )
    const [custom3R, custom3G, custom3B] = hexToRgb("#A0A0A0")
    this.customColor3Uniform = uniform(
      new THREE.Vector3(custom3R, custom3G, custom3B)
    )
    const [custom4R, custom4G, custom4B] = hexToRgb("#E8E8E8")
    this.customColor4Uniform = uniform(
      new THREE.Vector3(custom4R, custom4G, custom4B)
    )
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)

    this.cyanAngleUniform = uniform((15 * Math.PI) / 180)
    this.magentaAngleUniform = uniform((75 * Math.PI) / 180)
    this.yellowAngleUniform = uniform(0)
    this.keyAngleUniform = uniform((45 * Math.PI) / 180)

    const [paperR, paperG, paperB] = hexToRgb("#F5F5F0")
    this.paperRedUniform = uniform(paperR)
    this.paperGreenUniform = uniform(paperG)
    this.paperBlueUniform = uniform(paperB)
    this.paperGrainUniform = uniform(0.15)
    this.gcrUniform = uniform(0.5)
    this.registrationUniform = uniform(0)

    const [cyanR, cyanG, cyanB] = hexToRgb("#00AEEF")
    this.inkCyanUniform = uniform(new THREE.Vector3(cyanR, cyanG, cyanB))
    const [magR, magG, magB] = hexToRgb("#EC008C")
    this.inkMagentaUniform = uniform(new THREE.Vector3(magR, magG, magB))
    const [yelR, yelG, yelB] = hexToRgb("#FFF200")
    this.inkYellowUniform = uniform(new THREE.Vector3(yelR, yelG, yelB))
    const [keyR, keyG, keyB] = hexToRgb("#1a1a1a")
    this.inkKeyUniform = uniform(new THREE.Vector3(keyR, keyG, keyB))

    this.dotGainUniform = uniform(0)
    this.dotMorphUniform = uniform(0)

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

  override updateParams(params: LayerParameterValues): void {
    this.spacingUniform.value =
      typeof params.spacing === "number" ? Math.max(2, params.spacing) : 12
    this.dotSizeUniform.value =
      typeof params.dotSize === "number" ? params.dotSize : 0.8
    this.dotMinUniform.value =
      typeof params.dotMin === "number" ? params.dotMin : 0
    this.contrastUniform.value =
      typeof params.contrast === "number" ? params.contrast : 1
    this.softnessUniform.value =
      typeof params.softness === "number" ? params.softness : 0.25
    this.invertUniform.value = params.invertLuma === true ? 1 : 0
    this.angleUniform.value =
      typeof params.angle === "number" ? (params.angle * Math.PI) / 180 : 0

    const shapeMap: Record<string, number> = {
      circle: 0,
      square: 1,
      diamond: 2,
      line: 3,
    }
    this.shapeUniform.value = shapeMap[params.shape as string] ?? 0

    if (typeof params.ink === "string") {
      const [r, g, b] = hexToRgb(params.ink)
      this.inkRedUniform.value = r
      this.inkGreenUniform.value = g
      this.inkBlueUniform.value = b
    }

    if (typeof params.duotoneLight === "string") {
      const [r, g, b] = hexToRgb(params.duotoneLight)
      ;(this.duotoneLightUniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.duotoneDark === "string") {
      const [r, g, b] = hexToRgb(params.duotoneDark)
      ;(this.duotoneDarkUniform.value as THREE.Vector3).set(r, g, b)
    }

    if (typeof params.customBgColor === "string") {
      const [r, g, b] = hexToRgb(params.customBgColor)
      ;(this.customBgColorUniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.customColorCount === "number") {
      this.customColorCountUniform.value = Math.min(
        4,
        Math.max(2, Math.round(params.customColorCount))
      )
    }
    if (typeof params.customLuminanceBias === "number") {
      this.customLuminanceBiasUniform.value = Math.min(
        1,
        Math.max(-1, params.customLuminanceBias)
      )
    }
    if (typeof params.customColor1 === "string") {
      const [r, g, b] = hexToRgb(params.customColor1)
      ;(this.customColor1Uniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.customColor2 === "string") {
      const [r, g, b] = hexToRgb(params.customColor2)
      ;(this.customColor2Uniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.customColor3 === "string") {
      const [r, g, b] = hexToRgb(params.customColor3)
      ;(this.customColor3Uniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.customColor4 === "string") {
      const [r, g, b] = hexToRgb(params.customColor4)
      ;(this.customColor4Uniform.value as THREE.Vector3).set(r, g, b)
    }

    if (typeof params.cyanAngle === "number") {
      this.cyanAngleUniform.value = (params.cyanAngle * Math.PI) / 180
    }
    if (typeof params.magentaAngle === "number") {
      this.magentaAngleUniform.value = (params.magentaAngle * Math.PI) / 180
    }
    if (typeof params.yellowAngle === "number") {
      this.yellowAngleUniform.value = (params.yellowAngle * Math.PI) / 180
    }
    if (typeof params.keyAngle === "number") {
      this.keyAngleUniform.value = (params.keyAngle * Math.PI) / 180
    }

    if (typeof params.paperColor === "string") {
      const [r, g, b] = hexToRgb(params.paperColor)
      this.paperRedUniform.value = r
      this.paperGreenUniform.value = g
      this.paperBlueUniform.value = b
    }
    if (typeof params.paperGrain === "number") {
      this.paperGrainUniform.value = params.paperGrain
    }
    if (typeof params.gcr === "number") {
      this.gcrUniform.value = params.gcr
    }
    if (typeof params.registration === "number") {
      this.registrationUniform.value = params.registration
    }
    if (typeof params.dotGain === "number") {
      this.dotGainUniform.value = params.dotGain
    }
    if (typeof params.dotMorph === "number") {
      this.dotMorphUniform.value = params.dotMorph
    }
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number"
        ? Math.max(0, params.bloomIntensity)
        : 1.25
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number"
        ? clamp01(params.bloomThreshold)
        : 0.6
    const nextBloomRadius =
      typeof params.bloomRadius === "number"
        ? Math.max(0, params.bloomRadius)
        : 6
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number"
        ? clamp01(params.bloomSoftness)
        : 0.35

    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold

    if (typeof params.inkCyan === "string") {
      const [r, g, b] = hexToRgb(params.inkCyan)
      ;(this.inkCyanUniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.inkMagenta === "string") {
      const [r, g, b] = hexToRgb(params.inkMagenta)
      ;(this.inkMagentaUniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.inkYellow === "string") {
      const [r, g, b] = hexToRgb(params.inkYellow)
      ;(this.inkYellowUniform.value as THREE.Vector3).set(r, g, b)
    }
    if (typeof params.inkKey === "string") {
      const [r, g, b] = hexToRgb(params.inkKey)
      ;(this.inkKeyUniform.value as THREE.Vector3).set(r, g, b)
    }

    let needsRebuild = false

    const nextColorMode = parseColorMode(params.colorMode)
    if (nextColorMode !== this.colorMode) {
      this.colorMode = nextColorMode
      needsRebuild = true
    }

    const resolvedBloomEnabled =
      nextColorMode === "custom" && params.bloomEnabled === true
    if (resolvedBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = resolvedBloomEnabled
      needsRebuild = true
    }

    const nextCmykBlend = parseCmykBlend(params.cmykBlend)
    if (nextCmykBlend !== this.cmykBlendMode) {
      this.cmykBlendMode = nextCmykBlend
      needsRebuild = true
    }

    if (needsRebuild) {
      this.rebuildEffectNode()
      return
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value =
        this.normalizeBloomSoftness(nextBloomSoftness)
    }
  }

  override dispose(): void {
    this.disposeBloomNode()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.spacingUniform) return this.inputNode

    this.disposeBloomNode()
    this.bloomNode = null
    this.sampleNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const pixCoord = renderTargetUv.mul(screenSize)

    if (this.colorMode === "cmyk") {
      return this.buildCmykNode(pixCoord, renderTargetUv)
    }

    return this.buildSingleChannelNode(pixCoord, renderTargetUv)
  }

  private buildSingleChannelNode(pixCoord: Node, _renderTargetUv: Node): Node {
    const grid = this.buildHalftoneGrid(
      pixCoord,
      this.angleUniform,
      (sample) => {
        return float(sample.r)
          .mul(0.2126)
          .add(float(sample.g).mul(0.7152))
          .add(float(sample.b).mul(0.0722))
      }
    )

    const darkVec = vec3(
      float(this.duotoneDarkUniform.x),
      float(this.duotoneDarkUniform.y),
      float(this.duotoneDarkUniform.z)
    )
    const lightVec = vec3(
      float(this.duotoneLightUniform.x),
      float(this.duotoneLightUniform.y),
      float(this.duotoneLightUniform.z)
    )
    const customBgVec = vec3(
      float(this.customBgColorUniform.x),
      float(this.customBgColorUniform.y),
      float(this.customBgColorUniform.z)
    )
    const customColor1Vec = vec3(
      float(this.customColor1Uniform.x),
      float(this.customColor1Uniform.y),
      float(this.customColor1Uniform.z)
    )
    const customColor2Vec = vec3(
      float(this.customColor2Uniform.x),
      float(this.customColor2Uniform.y),
      float(this.customColor2Uniform.z)
    )
    const customColor3Vec = vec3(
      float(this.customColor3Uniform.x),
      float(this.customColor3Uniform.y),
      float(this.customColor3Uniform.z)
    )
    const customColor4Vec = vec3(
      float(this.customColor4Uniform.x),
      float(this.customColor4Uniform.y),
      float(this.customColor4Uniform.z)
    )
    const customColorCount = clamp(
      float(this.customColorCountUniform),
      float(2),
      float(4)
    )
    const customLuminance = clamp(
      grid.luma.add(float(this.customLuminanceBiasUniform).mul(0.35)),
      float(0),
      float(1)
    )

    let dotColor: Node
    let bgColor: Node
    let emissiveColor: Node = vec3(float(0), float(0), float(0))

    switch (this.colorMode) {
      case "monochrome": {
        const inkVec = vec3(
          this.inkRedUniform,
          this.inkGreenUniform,
          this.inkBlueUniform
        )
        dotColor = vec3(grid.luma, grid.luma, grid.luma).mul(inkVec)
        bgColor = vec3(0, 0, 0)
        break
      }
      case "duotone":
        dotColor = mix(darkVec, lightVec, grid.luma)
        bgColor = darkVec
        break
      case "custom":
        dotColor = select(
          customColorCount.lessThan(float(2.5)),
          select(
            customLuminance.lessThan(float(0.5)),
            customColor1Vec,
            customColor2Vec
          ),
          select(
            customColorCount.lessThan(float(3.5)),
            select(
              customLuminance.lessThan(float(1 / 3)),
              customColor1Vec,
              select(
                customLuminance.lessThan(float(2 / 3)),
                customColor2Vec,
                customColor3Vec
              )
            ),
            select(
              customLuminance.lessThan(float(0.25)),
              customColor1Vec,
              select(
                customLuminance.lessThan(float(0.5)),
                customColor2Vec,
                select(
                  customLuminance.lessThan(float(0.75)),
                  customColor3Vec,
                  customColor4Vec
                )
              )
            )
          )
        )
        bgColor = customBgVec
        emissiveColor = dotColor.mul(grid.coverage)
        break
      default:
        dotColor = grid.color
        bgColor = vec3(1, 1, 1)
        break
    }

    const baseColor = mix(bgColor, dotColor, grid.coverage)

    if (!(this.colorMode === "custom" && this.bloomEnabled)) {
      return vec4(baseColor, float(1))
    }

    const bloomInput = vec4(emissiveColor, float(1))
    this.bloomNode = bloom(
      bloomInput,
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number
    )

    return vec4(
      clamp(
        baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1))
      ),
      float(1)
    )
  }

  private buildCmykNode(pixCoord: Node, renderTargetUv: Node): Node {
    const gcrAmount = this.gcrUniform

    const extractCyan = (sample: Node) => {
      const maxK = float(1).sub(
        max(max(float(sample.r), float(sample.g)), float(sample.b))
      )
      const k = maxK.mul(gcrAmount)
      const oneMinusK = max(float(1).sub(k), float(0.001))
      return clamp(
        float(1).sub(float(sample.r)).sub(k).div(oneMinusK),
        float(0),
        float(1)
      )
    }

    const extractMagenta = (sample: Node) => {
      const maxK = float(1).sub(
        max(max(float(sample.r), float(sample.g)), float(sample.b))
      )
      const k = maxK.mul(gcrAmount)
      const oneMinusK = max(float(1).sub(k), float(0.001))
      return clamp(
        float(1).sub(float(sample.g)).sub(k).div(oneMinusK),
        float(0),
        float(1)
      )
    }

    const extractYellow = (sample: Node) => {
      const maxK = float(1).sub(
        max(max(float(sample.r), float(sample.g)), float(sample.b))
      )
      const k = maxK.mul(gcrAmount)
      const oneMinusK = max(float(1).sub(k), float(0.001))
      return clamp(
        float(1).sub(float(sample.b)).sub(k).div(oneMinusK),
        float(0),
        float(1)
      )
    }

    const extractKey = (sample: Node) => {
      const maxK = float(1).sub(
        max(max(float(sample.r), float(sample.g)), float(sample.b))
      )
      return maxK.mul(gcrAmount)
    }

    const reg = float(this.registrationUniform)
    const cyanCoord = pixCoord.add(vec2(reg, float(0)))
    const magentaCoord = pixCoord.add(vec2(reg.mul(-0.5), reg.mul(0.866)))
    const yellowCoord = pixCoord.add(vec2(reg.mul(-0.5), reg.mul(-0.866)))

    const cyanGrid = this.buildHalftoneGrid(
      cyanCoord,
      this.cyanAngleUniform,
      extractCyan
    )
    const magentaGrid = this.buildHalftoneGrid(
      magentaCoord,
      this.magentaAngleUniform,
      extractMagenta
    )
    const yellowGrid = this.buildHalftoneGrid(
      yellowCoord,
      this.yellowAngleUniform,
      extractYellow
    )
    const keyGrid = this.buildHalftoneGrid(
      pixCoord,
      this.keyAngleUniform,
      extractKey
    )

    const grain = grainTexturePattern(renderTargetUv.mul(screenSize))
    const grainOffset = grain.sub(0.5).mul(this.paperGrainUniform)
    const paperR = clamp(
      float(this.paperRedUniform).add(grainOffset),
      float(0),
      float(1)
    )
    const paperG = clamp(
      float(this.paperGreenUniform).add(grainOffset),
      float(0),
      float(1)
    )
    const paperB = clamp(
      float(this.paperBlueUniform).add(grainOffset),
      float(0),
      float(1)
    )

    const inkC = vec3(
      float(this.inkCyanUniform.x),
      float(this.inkCyanUniform.y),
      float(this.inkCyanUniform.z)
    )
    const inkM = vec3(
      float(this.inkMagentaUniform.x),
      float(this.inkMagentaUniform.y),
      float(this.inkMagentaUniform.z)
    )
    const inkY = vec3(
      float(this.inkYellowUniform.x),
      float(this.inkYellowUniform.y),
      float(this.inkYellowUniform.z)
    )
    const inkK = vec3(
      float(this.inkKeyUniform.x),
      float(this.inkKeyUniform.y),
      float(this.inkKeyUniform.z)
    )

    const transC = mix(vec3(1, 1, 1), inkC, cyanGrid.coverage)
    const transM = mix(vec3(1, 1, 1), inkM, magentaGrid.coverage)
    const transY = mix(vec3(1, 1, 1), inkY, yellowGrid.coverage)
    const transK = mix(vec3(1, 1, 1), inkK, keyGrid.coverage)

    const paper = vec3(paperR, paperG, paperB)
    let finalColor: Node

    if (this.cmykBlendMode === "overprint") {
      finalColor = vec3(
        clamp(
          paper.x.mul(transC.x).mul(transM.x).mul(transY.x).mul(transK.x),
          float(0),
          float(1)
        ),
        clamp(
          paper.y.mul(transC.y).mul(transM.y).mul(transY.y).mul(transK.y),
          float(0),
          float(1)
        ),
        clamp(
          paper.z.mul(transC.z).mul(transM.z).mul(transY.z).mul(transK.z),
          float(0),
          float(1)
        )
      )
    } else {
      const layerC = vec3(
        paper.x.mul(transC.x),
        paper.y.mul(transC.y),
        paper.z.mul(transC.z)
      )
      const layerM = vec3(
        paper.x.mul(transM.x),
        paper.y.mul(transM.y),
        paper.z.mul(transM.z)
      )
      const layerY = vec3(
        paper.x.mul(transY.x),
        paper.y.mul(transY.y),
        paper.z.mul(transY.z)
      )
      const layerK = vec3(
        paper.x.mul(transK.x),
        paper.y.mul(transK.y),
        paper.z.mul(transK.z)
      )

      finalColor = vec3(
        clamp(
          min(min(layerC.x, layerM.x), min(layerY.x, layerK.x)),
          float(0),
          float(1)
        ),
        clamp(
          min(min(layerC.y, layerM.y), min(layerY.y, layerK.y)),
          float(0),
          float(1)
        ),
        clamp(
          min(min(layerC.z, layerM.z), min(layerY.z, layerK.z)),
          float(0),
          float(1)
        )
      )
    }

    return vec4(finalColor, float(1))
  }

  private buildHalftoneGrid(
    pixCoord: Node,
    angleRadians: Node,
    channelExtractor: (sample: Node) => Node
  ): { color: Node; coverage: Node; luma: Node } {
    const cosA = float(cos(angleRadians))
    const sinA = float(sin(angleRadians))

    const rotX = cosA.mul(pixCoord.x).add(sinA.mul(pixCoord.y))
    const rotY = cosA.mul(pixCoord.y).sub(sinA.mul(pixCoord.x))

    const ccrX = floor(float(rotX.div(this.spacingUniform)).add(0.5)).mul(
      this.spacingUniform
    )
    const ccrY = floor(float(rotY.div(this.spacingUniform)).add(0.5)).mul(
      this.spacingUniform
    )

    const aa = max(
      float(0.5),
      float(this.softnessUniform).mul(this.spacingUniform).mul(0.3)
    )

    let accCov: Node = float(0)
    let accR: Node = float(0)
    let accG: Node = float(0)
    let accB: Node = float(0)
    let accLuma: Node = float(0)

    let accField: Node = float(0)
    let accWeightR: Node = float(0)
    let accWeightG: Node = float(0)
    let accWeightB: Node = float(0)
    let accWeightLuma: Node = float(0)

    const morph = clamp(float(this.dotMorphUniform), float(0), float(1))
    const fieldReach = this.spacingUniform.mul(morph).mul(0.6)

    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const cellRX =
          di === 0 ? ccrX : float(ccrX.add(this.spacingUniform.mul(float(di))))
        const cellRY =
          dj === 0 ? ccrY : float(ccrY.add(this.spacingUniform.mul(float(dj))))

        const cellSX = cosA.mul(cellRX).sub(sinA.mul(cellRY))
        const cellSY = sinA.mul(cellRX).add(cosA.mul(cellRY))
        const cellUV = vec2(cellSX, cellSY).div(screenSize)

        const sNode = tslTexture(new THREE.Texture(), cellUV)
        this.sampleNodes.push(sNode)

        const channelValue = channelExtractor(sNode)
        const clampedValue = clamp(
          channelValue.mul(this.contrastUniform),
          float(0),
          float(1)
        )

        const effectiveValue = select(
          this.invertUniform.greaterThan(float(0.5)),
          float(1).sub(clampedValue),
          clampedValue
        )

        const radius = float(this.dotMinUniform)
          .add(effectiveValue.mul(this.dotSizeUniform))
          .add(this.dotGainUniform)
          .mul(this.spacingUniform)
          .mul(0.5)

        const dx = rotX.sub(cellRX)
        const dy = rotY.sub(cellRY)

        const dCircle = vec2(dx, dy).length()
        const dSquare = max(abs(dx), abs(dy))
        const dDiamond = abs(dx).add(abs(dy))
        const dLine = abs(dy)

        const dist = select(
          this.shapeUniform.lessThan(float(0.5)),
          dCircle,
          select(
            this.shapeUniform.lessThan(float(1.5)),
            dSquare,
            select(this.shapeUniform.lessThan(float(2.5)), dDiamond, dLine)
          )
        )

        const cellCov = smoothstep(radius.add(aa), radius.sub(aa), dist)

        const isNew = cellCov.greaterThan(accCov)
        const maxR = select(isNew, float(sNode.r), accR)
        const maxG = select(isNew, float(sNode.g), accG)
        const maxB = select(isNew, float(sNode.b), accB)
        const maxLuma = select(isNew, effectiveValue, accLuma)
        const maxCov = max(cellCov, accCov)

        const fieldRadius = max(radius.add(fieldReach), float(0.001))
        const cellField = clamp(
          float(1).sub(dist.div(fieldRadius)),
          float(0),
          float(1)
        )
        const cellFieldSq = cellField.mul(cellField)

        accWeightR = accWeightR.add(float(sNode.r).mul(cellFieldSq))
        accWeightG = accWeightG.add(float(sNode.g).mul(cellFieldSq))
        accWeightB = accWeightB.add(float(sNode.b).mul(cellFieldSq))
        accWeightLuma = accWeightLuma.add(effectiveValue.mul(cellFieldSq))
        accField = accField.add(cellFieldSq)

        accR = maxR
        accG = maxG
        accB = maxB
        accLuma = maxLuma
        accCov = maxCov
      }
    }

    const metaEdge = max(float(0.01), aa.div(this.spacingUniform).mul(0.5))
    const metaCov = smoothstep(
      float(0.5).sub(metaEdge),
      float(0.5).add(metaEdge),
      accField
    )
    const fieldWeight = max(accField, float(0.001))

    const finalCov = mix(accCov, metaCov, morph)
    const finalR = mix(accR, accWeightR.div(fieldWeight), morph)
    const finalG = mix(accG, accWeightG.div(fieldWeight), morph)
    const finalB = mix(accB, accWeightB.div(fieldWeight), morph)
    const finalLuma = mix(accLuma, accWeightLuma.div(fieldWeight), morph)

    return {
      color: vec3(finalR, finalG, finalB),
      coverage: finalCov,
      luma: finalLuma,
    }
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

    if (
      "getTextureNode" in bloomNode &&
      typeof bloomNode.getTextureNode === "function"
    ) {
      return bloomNode.getTextureNode()
    }

    if (
      "getTexture" in bloomNode &&
      typeof bloomNode.getTexture === "function"
    ) {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }
}

function parseColorMode(value: unknown): HalftoneColorMode {
  if (
    value === "source" ||
    value === "monochrome" ||
    value === "duotone" ||
    value === "custom" ||
    value === "cmyk"
  ) {
    return value
  }
  return "source"
}

function parseCmykBlend(value: unknown): CmykBlendMode {
  if (value === "subtractive" || value === "overprint") {
    return value
  }
  return "subtractive"
}
