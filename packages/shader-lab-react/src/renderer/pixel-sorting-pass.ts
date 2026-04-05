import * as THREE from "three/webgpu"
import {
  dot,
  float,
  floor,
  max,
  min,
  mod,
  select,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

export class PixelSortingPass extends PassNode {
  private readonly sortScene: THREE.Scene
  private readonly sortCamera: THREE.OrthographicCamera
  private readonly sortMaterial: THREE.MeshBasicNodeMaterial
  private sortRtA: THREE.WebGLRenderTarget
  private sortRtB: THREE.WebGLRenderTarget

  private readonly blitInputNode: Node
  private readonly sortTexNodeA: Node
  private readonly sortTexNodeB: Node

  private readonly passOffsetUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node
  private readonly thresholdUniform: Node
  private readonly upperThresholdUniform: Node
  private readonly directionUniform: Node
  private readonly modeUniform: Node
  private readonly reverseUniform: Node

  private passCount = 150
  private width = 1
  private height = 1

  constructor(layerId: string) {
    super(layerId)

    this.sortScene = new THREE.Scene()
    this.sortCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.passOffsetUniform = uniform(0)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.thresholdUniform = uniform(0.25)
    this.upperThresholdUniform = uniform(1)
    this.directionUniform = uniform(0)
    this.modeUniform = uniform(0)
    this.reverseUniform = uniform(0)

    const placeholder = createPipelinePlaceholder()

    // Compute pixel coordinates from flipped UVs
    const texUv = vec2(uv().x, float(1).sub(uv().y))
    const dims = vec2(this.widthUniform, this.heightUniform)
    const pixelCoord = floor(texUv.mul(dims))

    // Sort axis: horizontal (x) or vertical (y)
    const isHorizontal = this.directionUniform.lessThan(float(0.5))
    const sortIdx = select(isHorizontal, pixelCoord.x, pixelCoord.y)
    const maxIdx = select(isHorizontal, this.widthUniform, this.heightUniform)

    // Odd-even transposition: alternate pair groupings each pass
    const pairMod = mod(sortIdx.add(this.passOffsetUniform), float(2))
    const isLeft = pairMod.lessThan(float(1))

    // Neighbor pixel coordinate
    const neighborDir = select(isLeft, float(1), float(-1))
    const neighborCoord = vec2(
      select(isHorizontal, pixelCoord.x.add(neighborDir), pixelCoord.x),
      select(isHorizontal, pixelCoord.y, pixelCoord.y.add(neighborDir)),
    )

    // Bounds check
    const neighborIdx = select(isHorizontal, neighborCoord.x, neighborCoord.y)
    const inBounds = neighborIdx
      .greaterThanEqual(float(0))
      .and(neighborIdx.lessThan(maxIdx))

    // Sample both pixels (snapped to texel centers)
    const mySnapUv = pixelCoord.add(0.5).div(dims)
    const neighborSnapUv = neighborCoord.add(0.5).div(dims)

    this.sortTexNodeA = tslTexture(placeholder, mySnapUv)
    this.sortTexNodeB = tslTexture(placeholder, neighborSnapUv)

    const myColor = this.sortTexNodeA
    const neighborColor = this.sortTexNodeB

    // Sort value: luminance
    const lumaW = vec3(0.2126, 0.7152, 0.0722)
    const myLuma = dot(vec3(myColor.r, myColor.g, myColor.b), lumaW)
    const neighborLuma = dot(
      vec3(neighborColor.r, neighborColor.g, neighborColor.b),
      lumaW,
    )

    // Sort value: warmth (R-B, approximates hue/temperature)
    const myWarmth = myColor.r.sub(myColor.b)
    const neighborWarmth = neighborColor.r.sub(neighborColor.b)

    // Sort value: saturation (HSV)
    const myMax = max(max(myColor.r, myColor.g), myColor.b)
    const myMin = min(min(myColor.r, myColor.g), myColor.b)
    const mySat = select(
      myMax.greaterThan(float(0.001)),
      myMax.sub(myMin).div(myMax),
      float(0),
    )
    const nMax = max(max(neighborColor.r, neighborColor.g), neighborColor.b)
    const nMin = min(min(neighborColor.r, neighborColor.g), neighborColor.b)
    const nSat = select(
      nMax.greaterThan(float(0.001)),
      nMax.sub(nMin).div(nMax),
      float(0),
    )

    // Select sort value based on mode (0=luma, 1=hue/warmth, 2=saturation)
    const isSatMode = this.modeUniform.greaterThan(float(1.5))
    const isHueMode = this.modeUniform.greaterThan(float(0.5))
    const myValue = select(isSatMode, mySat, select(isHueMode, myWarmth, myLuma))
    const neighborValue = select(
      isSatMode,
      nSat,
      select(isHueMode, neighborWarmth, neighborLuma),
    )

    // Validation: both pixels must be within threshold band (luma-based)
    const myInBand = myLuma
      .greaterThan(this.thresholdUniform)
      .and(myLuma.lessThan(this.upperThresholdUniform))
    const neighborInBand = neighborLuma
      .greaterThan(this.thresholdUniform)
      .and(neighborLuma.lessThan(this.upperThresholdUniform))
    const valid = myInBand.or(neighborInBand)

    // Sort: swap if left > right (ascending) or left < right (descending/reverse)
    const leftValue = select(isLeft, myValue, neighborValue)
    const rightValue = select(isLeft, neighborValue, myValue)
    const isReverse = this.reverseUniform.greaterThan(float(0.5))
    const shouldSwap = select(
      isReverse,
      rightValue.greaterThan(leftValue),
      leftValue.greaterThan(rightValue),
    )

    const doSwap = inBounds.and(valid).and(shouldSwap)
    const result = vec4(
      select(doSwap, neighborColor.r, myColor.r),
      select(doSwap, neighborColor.g, myColor.g),
      select(doSwap, neighborColor.b, myColor.b),
      float(1),
    )

    this.sortMaterial = new THREE.MeshBasicNodeMaterial()
    this.sortMaterial.colorNode = result as Node

    const sortMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.sortMaterial,
    )
    sortMesh.frustumCulled = false
    this.sortScene.add(sortMesh)

    // Internal ping-pong render targets
    const rtOptions = {
      depthBuffer: false,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    }
    this.sortRtA = new THREE.WebGLRenderTarget(1, 1, rtOptions)
    this.sortRtB = new THREE.WebGLRenderTarget(1, 1, rtOptions)

    // Blit node for PassNode pipeline
    const blitUv = vec2(uv().x, float(1).sub(uv().y))
    this.blitInputNode = tslTexture(createPipelinePlaceholder(), blitUv)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    let readTexture: THREE.Texture = inputTexture
    let writeTarget = this.sortRtA

    for (let i = 0; i < this.passCount; i++) {
      this.passOffsetUniform.value = i % 2
      this.sortTexNodeA.value = readTexture
      this.sortTexNodeB.value = readTexture
      renderer.setRenderTarget(writeTarget)
      renderer.render(this.sortScene, this.sortCamera)

      if (writeTarget === this.sortRtA) {
        readTexture = this.sortRtA.texture
        writeTarget = this.sortRtB
      } else {
        readTexture = this.sortRtB.texture
        writeTarget = this.sortRtA
      }
    }

    this.blitInputNode.value = readTexture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.thresholdUniform.value =
      typeof params.threshold === "number" ? params.threshold : 0.25

    this.upperThresholdUniform.value =
      typeof params.upperThreshold === "number" ? params.upperThreshold : 1

    this.directionUniform.value = params.direction === "vertical" ? 1 : 0

    this.reverseUniform.value = params.reverse === true ? 1 : 0

    if (params.mode === "hue") {
      this.modeUniform.value = 1
    } else if (params.mode === "saturation") {
      this.modeUniform.value = 2
    } else {
      this.modeUniform.value = 0
    }

    const range = typeof params.range === "number" ? params.range : 0.3
    this.passCount = Math.max(1, Math.round(range * 300))
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.widthUniform.value = this.width
    this.heightUniform.value = this.height
    this.sortRtA.setSize(this.width, this.height)
    this.sortRtB.setSize(this.width, this.height)
  }

  override dispose(): void {
    this.sortRtA.dispose()
    this.sortRtB.dispose()
    this.sortMaterial.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.blitInputNode) {
      return this.inputNode
    }

    return vec4(
      this.blitInputNode.r,
      this.blitInputNode.g,
      this.blitInputNode.b,
      float(1),
    )
  }
}
