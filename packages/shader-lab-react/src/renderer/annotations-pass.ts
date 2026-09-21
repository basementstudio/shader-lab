import {
  abs,
  atan,
  attribute,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  min,
  positionLocal,
  select,
  sin,
  smoothstep,
  step,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  type AnnotationConfig,
  type AnnotationElement,
  type AnnotationGlyph,
  ANNOTATION_KIND,
  ANNOTATION_PALETTE_SIZE,
  type EdgeField,
  layoutAnnotations,
  MAX_ANNOTATION_ELEMENTS,
  MAX_ANNOTATION_GLYPHS,
  parseAnnotationConfig,
} from "./annotations-layout"
import { buildLabelAtlas, LABEL_CHARS } from "./blob-label-atlas"
import { type CellPaintMask, decodeCellPaintMask } from "./cell-paint-mask"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const EDGE_WIDTH = 128
const EDGE_HEIGHT = 72

const RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.UnsignedByteType,
} as const

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

export class AnnotationsPass extends PassNode {
  private config: AnnotationConfig | null = null
  private configKey = ""
  private paintValue = ""
  private paintMask: CellPaintMask | null = null
  private edges: EdgeField | null = null
  pendingReadback: Promise<void> | null = null
  private edgeFrame = 0
  layoutOverride: { elements: AnnotationElement[]; glyphs: AnnotationGlyph[] } | null = null

  private readonly orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly quad = new THREE.PlaneGeometry(2, 2)
  private decorationScene: THREE.Scene | null = null
  private decorationRt: THREE.WebGLRenderTarget | null = null
  private readonly decorationPlaceholder = new THREE.Texture()
  private decorationSample: Node | null = null

  private elementMesh: THREE.Mesh | null = null
  private glyphMesh: THREE.Mesh | null = null
  private readonly elementRect = new Float32Array(MAX_ANNOTATION_ELEMENTS * 4)
  private readonly elementMeta = new Float32Array(MAX_ANNOTATION_ELEMENTS * 4)
  private readonly elementExtra = new Float32Array(MAX_ANNOTATION_ELEMENTS * 4)
  private readonly glyphRect = new Float32Array(MAX_ANNOTATION_GLYPHS * 4)
  private readonly glyphMeta = new Float32Array(MAX_ANNOTATION_GLYPHS * 4)
  private readonly attributes: THREE.InstancedBufferAttribute[] = []
  private elementCount = 0
  private glyphCount = 0

  private readonly labelAtlas: THREE.Texture | null = buildLabelAtlas()
  private readonly aspectUniform = uniform(16 / 9)
  private readonly edgeSoftUniform = uniform(1.5 / 1080)
  private readonly paletteUniforms = Array.from(
    { length: ANNOTATION_PALETTE_SIZE },
    () => uniform(new THREE.Color("#d7d2c8"))
  )

  private edgeScene: THREE.Scene | null = null
  private edgeMaterial: THREE.MeshBasicNodeMaterial | null = null
  private edgeRt: THREE.WebGLRenderTarget | null = null
  private edgeInput: Node | null = null

  private deviceWidth = 1
  private deviceHeight = 1
  private logicalWidth = 1920
  private logicalHeight = 1080
  private time = 0

  constructor(layerId: string) {
    super(layerId)
    this.createDecorationResources()
    this.createEdgeResources()
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    const config = parseAnnotationConfig(params)
    const key = JSON.stringify(config)
    if (key === this.configKey) return
    this.configKey = key
    this.config = config
    if (config.paint !== this.paintValue) {
      this.paintValue = config.paint
      this.paintMask = config.paint ? decodeCellPaintMask(config.paint) : null
    }
    config.colors.forEach((color, index) => {
      ;(this.paletteUniforms[index]?.value as THREE.Color | undefined)?.setStyle(
        color,
        THREE.SRGBColorSpace
      )
    })
    for (let index = config.colors.length; index < ANNOTATION_PALETTE_SIZE; index++) {
      ;(this.paletteUniforms[index]?.value as THREE.Color | undefined)?.setStyle(
        config.colors[0] ?? "#d7d2c8",
        THREE.SRGBColorSpace
      )
    }
    this.relayout()
  }

  override resize(width: number, height: number): void {
    this.deviceWidth = Math.max(1, width)
    this.deviceHeight = Math.max(1, height)
    this.decorationRt?.setSize(this.deviceWidth, this.deviceHeight)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.aspectUniform.value = this.logicalWidth / this.logicalHeight
    this.edgeSoftUniform.value = 1.2 / this.logicalHeight
    this.relayout()
  }

  override needsContinuousRender(): boolean {
    return (this.config?.drift ?? 0) > 0 || this.config?.placement === "edges"
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.time = time
    if (this.config?.placement === "edges") {
      this.renderEdges(renderer, inputTexture)
    }
    this.relayout()
    this.renderDecorations(renderer)
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override dispose(): void {
    this.elementMesh?.geometry.dispose()
    ;(this.elementMesh?.material as THREE.Material | undefined)?.dispose()
    this.glyphMesh?.geometry.dispose()
    ;(this.glyphMesh?.material as THREE.Material | undefined)?.dispose()
    this.decorationRt?.dispose()
    this.decorationPlaceholder.dispose()
    this.edgeRt?.dispose()
    this.edgeMaterial?.dispose()
    this.quad.dispose()
    this.labelAtlas?.dispose()
    super.dispose()
  }

  getLayoutCounts(): { elements: number; glyphs: number } {
    return { elements: this.elementCount, glyphs: this.glyphCount }
  }

  protected override buildEffectNode(): Node {
    if (!this.decorationPlaceholder) {
      return this.inputNode
    }
    const sample = tslTexture(this.decorationPlaceholder, renderTargetUv())
    this.decorationSample = sample
    return vec4(vec3(sample.r, sample.g, sample.b), float(sample.a))
  }

  private relayout(): void {
    if (this.layoutOverride) {
      this.writeElements(this.layoutOverride.elements)
      this.writeGlyphs(this.layoutOverride.glyphs)
      return
    }
    if (!this.config) return
    const aspect = this.logicalWidth / this.logicalHeight
    const layout = layoutAnnotations(this.config, {
      aspect,
      time: this.time,
      edges: this.edges,
      paint: this.paintMask,
    })
    this.writeElements(layout.elements)
    this.writeGlyphs(layout.glyphs)
  }

  private writeElements(elements: AnnotationElement[]): void {
    const count = Math.min(elements.length, MAX_ANNOTATION_ELEMENTS)
    for (let i = 0; i < count; i++) {
      const element = elements[i]!
      const offset = i * 4
      this.elementRect[offset] = element.x
      this.elementRect[offset + 1] = element.y
      this.elementRect[offset + 2] = element.hw
      this.elementRect[offset + 3] = element.hh
      this.elementMeta[offset] = element.kind
      this.elementMeta[offset + 1] = element.a
      this.elementMeta[offset + 2] = element.b
      this.elementMeta[offset + 3] = element.color
      this.elementExtra[offset] = element.rotation
      this.elementExtra[offset + 1] = element.phase
      this.elementExtra[offset + 2] = 1
      this.elementExtra[offset + 3] = 0
    }
    this.elementCount = count
  }

  private writeGlyphs(glyphs: AnnotationGlyph[]): void {
    const count = Math.min(glyphs.length, MAX_ANNOTATION_GLYPHS)
    for (let i = 0; i < count; i++) {
      const glyph = glyphs[i]!
      const offset = i * 4
      this.glyphRect[offset] = glyph.x
      this.glyphRect[offset + 1] = glyph.y
      this.glyphRect[offset + 2] = glyph.hw
      this.glyphRect[offset + 3] = glyph.hh
      this.glyphMeta[offset] = glyph.glyph
      this.glyphMeta[offset + 1] = glyph.color
      this.glyphMeta[offset + 2] = 1
      this.glyphMeta[offset + 3] = 0
    }
    this.glyphCount = count
  }

  private paletteNode(index: Node): Node {
    let color: Node = vec3(0, 0, 0)
    for (let i = 0; i < ANNOTATION_PALETTE_SIZE; i++) {
      const weight = step(abs(index.sub(float(i))), float(0.5))
      color = color.add(vec3(this.paletteUniforms[i]!).mul(weight))
    }
    return color
  }

  private createMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial()
    material.transparent = true
    material.depthTest = false
    material.depthWrite = false
    material.blending = THREE.CustomBlending
    material.blendEquation = THREE.AddEquation
    material.blendSrc = THREE.OneFactor
    material.blendDst = THREE.OneMinusSrcAlphaFactor
    material.blendEquationAlpha = THREE.AddEquation
    material.blendSrcAlpha = THREE.OneFactor
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
    material.side = THREE.DoubleSide
    return material
  }

  private instancedQuad(
    attributes: Record<string, THREE.InstancedBufferAttribute>
  ): THREE.InstancedBufferGeometry {
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
        3
      )
    )
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
    )
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1))
    for (const [name, buffer] of Object.entries(attributes)) {
      buffer.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, buffer)
      this.attributes.push(buffer)
    }
    geometry.instanceCount = 0
    return geometry
  }

  private quadPosition(center: Node, half: Node, rotation: Node): Node {
    const c = cos(rotation)
    const s = sin(rotation)
    const local = vec2(
      positionLocal.x.mul(float(half.x)),
      positionLocal.y.mul(float(half.y))
    )
    const rotated = vec2(
      local.x.mul(c).sub(local.y.mul(s)),
      local.x.mul(s).add(local.y.mul(c))
    )
    const screenX = float(center.x).add(rotated.x).div(this.aspectUniform)
    const screenY = float(center.y).add(rotated.y)
    return vec3(screenX.mul(2).sub(1), float(1).sub(screenY.mul(2)), float(0))
  }

  private buildElementMesh(): void {
    const material = this.createMaterial()
    const rect = new THREE.InstancedBufferAttribute(this.elementRect, 4)
    const meta = new THREE.InstancedBufferAttribute(this.elementMeta, 4)
    const extra = new THREE.InstancedBufferAttribute(this.elementExtra, 4)
    const iRect = attribute("iRect", "vec4")
    const iMeta = attribute("iMeta", "vec4")
    const iExtra = attribute("iExtra", "vec4")
    const kind = float(iMeta.x)
    const stroke = float(iMeta.y)
    const param = float(iMeta.z)
    const rotation = float(iExtra.x)
    const phase = float(iExtra.y)
    const hw = float(iRect.z)
    const hh = float(iRect.w)
    const pad = max(stroke.mul(2), float(0.004)).add(this.edgeSoftUniform.mul(3))
    const half = vec2(hw.add(pad), hh.add(pad))
    material.positionNode = this.quadPosition(vec2(iRect.x, iRect.y), half, rotation) as Node

    const p = vec2(uv().x.mul(2).sub(1).mul(float(half.x)), uv().y.mul(2).sub(1).mul(float(half.y)))
    const ax = abs(p.x)
    const ay = abs(p.y)
    const edge = this.edgeSoftUniform
    const band = (distance: Node) =>
      float(1).sub(smoothstep(edge.negate(), edge, abs(distance).sub(stroke)))
    const fill = (distance: Node) => float(1).sub(smoothstep(edge.negate(), edge, distance))
    const TWO_PI = Math.PI * 2
    const safeX = select(abs(p.x).greaterThan(float(1e-6)), p.x, float(1e-6))
    const atanValue = atan(p.y.div(safeX))
    const polar = select(p.x.greaterThanEqual(0), atanValue, atanValue.add(float(Math.PI)))
    const dashRing = (segments: Node, offset: Node) =>
      step(float(0.5), fract(polar.div(float(TWO_PI)).mul(segments).add(offset)))
    const radial = length(p)
    const rectDistance = (() => {
      const d = vec2(ax.sub(hw), ay.sub(hh))
      return length(max(d, vec2(0))).add(min(max(d.x, d.y), float(0)))
    })()

    const dotCoverage = fill(radial.sub(hw))
    const ringCoverage = band(radial.sub(hw))
    const dashedRingCoverage = ringCoverage.mul(dashRing(param, phase))
    const crossArm = hw
    const crosshair = max(
      fill(max(ax.sub(crossArm), ay.sub(stroke))),
      fill(max(ay.sub(crossArm), ax.sub(stroke)))
    ).mul(step(hw.mul(0.3), radial))
    const diag = vec2(ax.add(ay).mul(Math.SQRT1_2), abs(ax.sub(ay)).mul(Math.SQRT1_2))
    const cross = max(
      fill(max(diag.x.sub(crossArm), diag.y.sub(stroke))),
      fill(max(diag.y.sub(crossArm), diag.x.sub(stroke)))
    )
    const boxCoverage = band(rectDistance)
    const perimeter = ax.add(ay)
    const dashedBox = boxCoverage.mul(step(float(0.5), fract(perimeter.div(hw.add(hh)).mul(param.mul(0.5)).add(phase))))
    const reach = param.mul(min(hw, hh))
    const brackets = boxCoverage.mul(step(hw.sub(reach), ax)).mul(step(hh.sub(reach), ay))
    const line = fill(max(ay.sub(stroke), ax.sub(hw)))
    const dashedLine = line.mul(step(float(0.5), fract(p.x.add(hw).div(hw.mul(2)).mul(param).add(phase))))
    const tickSpacing = hw.mul(2).div(max(param, float(1)))
    const tickIndex = floor(p.x.add(hw).div(tickSpacing).add(float(0.5)))
    const nearestTick = tickIndex.mul(tickSpacing).sub(hw)
    const isMajor = select(fract(tickIndex.div(float(4))).lessThan(float(0.01)), float(1), float(0))
    const tickLength = hh.add(hh.mul(isMajor))
    const tickBody = max(
      abs(p.x.sub(nearestTick)).sub(stroke),
      max(hh.sub(p.y).sub(tickLength), max(p.y.sub(hh), ax.sub(hw)))
    )
    const baseline = max(abs(p.y.sub(hh)).sub(stroke), ax.sub(hw))
    const ticks = max(fill(baseline), fill(tickBody))
    const pixelHash = fract(sin(dot(floor(p.mul(4096)), vec2(12.9898, 78.233))).mul(43758.5453))
    const gradientBar = fill(max(ax.sub(hw), ay.sub(hh))).mul(step(pixelHash, p.x.add(hw).div(hw.mul(2))))

    const isKind = (id: number) =>
      step(abs(kind.sub(float(id))), float(0.5))
    const coverage = dotCoverage
      .mul(isKind(ANNOTATION_KIND.dot))
      .add(ringCoverage.mul(isKind(ANNOTATION_KIND.ring)))
      .add(dashedRingCoverage.mul(isKind(ANNOTATION_KIND.dashedRing)))
      .add(crosshair.mul(isKind(ANNOTATION_KIND.crosshair)))
      .add(cross.mul(isKind(ANNOTATION_KIND.cross)))
      .add(boxCoverage.mul(isKind(ANNOTATION_KIND.box)))
      .add(dashedBox.mul(isKind(ANNOTATION_KIND.dashedBox)))
      .add(brackets.mul(isKind(ANNOTATION_KIND.brackets)))
      .add(line.mul(isKind(ANNOTATION_KIND.line)))
      .add(dashedLine.mul(isKind(ANNOTATION_KIND.dashedLine)))
      .add(ticks.mul(isKind(ANNOTATION_KIND.ticks)))
      .add(gradientBar.mul(isKind(ANNOTATION_KIND.gradientBar)))
    const alpha = clamp(coverage, 0, 1).mul(float(iExtra.z))
    const color = this.paletteNode(float(iMeta.w))
    material.colorNode = vec4(color.mul(alpha), alpha) as Node
    const mesh = new THREE.Mesh(this.instancedQuad({ iRect: rect, iMeta: meta, iExtra: extra }), material)
    mesh.frustumCulled = false
    this.decorationScene?.add(mesh)
    this.elementMesh = mesh
  }

  private buildGlyphMesh(): void {
    if (!this.labelAtlas) return
    const material = this.createMaterial()
    const rect = new THREE.InstancedBufferAttribute(this.glyphRect, 4)
    const meta = new THREE.InstancedBufferAttribute(this.glyphMeta, 4)
    const iRect = attribute("iRect", "vec4")
    const iMeta = attribute("iMeta", "vec4")
    const half = vec2(float(iRect.z), float(iRect.w))
    material.positionNode = this.quadPosition(vec2(iRect.x, iRect.y), half, float(0)) as Node
    const glyph = float(iMeta.x)
    const atlasUv = vec2(glyph.add(uv().x).div(float(LABEL_CHARS.length)), uv().y)
    const ink = float(tslTexture(this.labelAtlas, atlasUv).level(float(0)).r)
    const alpha = ink.mul(float(iMeta.z))
    const color = this.paletteNode(float(iMeta.y))
    material.colorNode = vec4(color.mul(alpha), alpha) as Node
    const mesh = new THREE.Mesh(this.instancedQuad({ iRect: rect, iMeta: meta }), material)
    mesh.frustumCulled = false
    this.decorationScene?.add(mesh)
    this.glyphMesh = mesh
  }

  private createDecorationResources(): void {
    this.decorationScene = new THREE.Scene()
    this.decorationRt = new THREE.WebGLRenderTarget(1, 1, RT_OPTIONS)
    this.buildElementMesh()
    this.buildGlyphMesh()
  }

  private renderDecorations(renderer: THREE.WebGPURenderer): void {
    if (!(this.decorationScene && this.decorationRt)) return
    for (const buffer of this.attributes) buffer.needsUpdate = true
    if (this.elementMesh) {
      ;(this.elementMesh.geometry as THREE.InstancedBufferGeometry).instanceCount = this.elementCount
      this.elementMesh.visible = this.elementCount > 0
    }
    if (this.glyphMesh) {
      ;(this.glyphMesh.geometry as THREE.InstancedBufferGeometry).instanceCount = this.glyphCount
      this.glyphMesh.visible = this.glyphCount > 0
    }
    const previousColor = renderer.getClearColor(new THREE.Color())
    const previousAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(this.decorationRt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(this.decorationScene, this.orthoCamera)
    renderer.setClearColor(previousColor, previousAlpha)
    if (this.decorationSample) this.decorationSample.value = this.decorationRt.texture
  }

  private createEdgeResources(): void {
    this.edgeScene = new THREE.Scene()
    this.edgeMaterial = new THREE.MeshBasicNodeMaterial()
    this.edgeRt = new THREE.WebGLRenderTarget(EDGE_WIDTH, EDGE_HEIGHT, {
      ...RT_OPTIONS,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    })
    const input = tslTexture(new THREE.Texture(), renderTargetUv())
    this.edgeInput = input
    const texel = vec2(1 / EDGE_WIDTH, 1 / EDGE_HEIGHT)
    const luma = (dx: number, dy: number) => {
      const sample = input.sample(renderTargetUv().add(texel.mul(vec2(dx, dy))))
      return dot(vec3(sample.r, sample.g, sample.b), vec3(0.2126, 0.7152, 0.0722))
    }
    const gx = luma(1, -1).add(luma(1, 0).mul(2)).add(luma(1, 1)).sub(luma(-1, -1)).sub(luma(-1, 0).mul(2)).sub(luma(-1, 1))
    const gy = luma(-1, 1).add(luma(0, 1).mul(2)).add(luma(1, 1)).sub(luma(-1, -1)).sub(luma(0, -1).mul(2)).sub(luma(1, -1))
    const magnitude = clamp(length(vec2(gx, gy)).mul(0.5), 0, 1)
    this.edgeMaterial.colorNode = vec4(magnitude, magnitude, magnitude, float(1)) as Node
    const mesh = new THREE.Mesh(this.quad, this.edgeMaterial)
    mesh.frustumCulled = false
    this.edgeScene.add(mesh)
  }

  private renderEdges(renderer: THREE.WebGPURenderer, input: THREE.Texture): void {
    if (!(this.edgeScene && this.edgeRt && this.edgeInput)) return
    this.edgeFrame += 1
    if (this.edgeFrame % 3 !== 1 || this.pendingReadback) return
    this.edgeInput.value = input
    renderer.setRenderTarget(this.edgeRt)
    renderer.render(this.edgeScene, this.orthoCamera)
    const target = this.edgeRt
    const read = (
      renderer as unknown as {
        readRenderTargetPixelsAsync: (
          rt: THREE.WebGLRenderTarget,
          x: number,
          y: number,
          w: number,
          h: number
        ) => Promise<ArrayBufferView>
      }
    ).readRenderTargetPixelsAsync
    this.pendingReadback = read
      .call(renderer, target, 0, 0, EDGE_WIDTH, EDGE_HEIGHT)
      .then((pixels) => {
        const bytes =
          pixels instanceof Uint8Array
            ? pixels
            : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
        const data = new Float32Array(EDGE_WIDTH * EDGE_HEIGHT)
        let peak = 0
        for (let i = 0; i < data.length; i++) {
          const value = (bytes[i * 4] ?? 0) / 255
          data[i] = value
          if (value > peak) peak = value
        }
        if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) / peak
        this.edges = { width: EDGE_WIDTH, height: EDGE_HEIGHT, data }
        this.pendingReadback = null
      })
      .catch(() => {
        this.pendingReadback = null
      })
  }
}
