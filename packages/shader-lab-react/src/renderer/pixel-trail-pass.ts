import {
  clamp,
  float,
  floor,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const MAX_PATH_SAMPLES = 256
const MIN_POINT_DISTANCE = 0.001
const VELOCITY_AMPLIFY = 5
const TAIL_RADIUS_FRAC = 0.25

export class PixelTrailPass extends PassNode {
  private cellSize = 24
  private radius = 0.04
  private decay = 0.9
  private displaceAmount = 0.02
  private intensity = 1

  private logicalWidth = 1
  private logicalHeight = 1
  private gridW = 1
  private gridH = 1

  private buffer: Float32Array
  private trailDataTexture: THREE.DataTexture
  private trailSampleNode: Node | null = null

  private pathX = new Float32Array(MAX_PATH_SAMPLES)
  private pathY = new Float32Array(MAX_PATH_SAMPLES)
  private pathVx = new Float32Array(MAX_PATH_SAMPLES)
  private pathVy = new Float32Array(MAX_PATH_SAMPLES)
  private pathAge = new Float32Array(MAX_PATH_SAMPLES)
  private pathHead = 0
  private pathSize = 0

  private readonly cellSizeUniform: Node
  private readonly displaceAmountUniform: Node
  private readonly intensityUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly gridWUniform: Node
  private readonly gridHUniform: Node

  private readonly sourcePlaceholder: THREE.Texture
  private sourceTextureNode: Node | null = null

  private readonly canvas: HTMLCanvasElement | null
  private readonly onPointerMove: ((event: PointerEvent) => void) | null
  private readonly onPointerLeave: (() => void) | null

  private pointerX: number | null = null
  private pointerY: number | null = null
  private pointerVx = 0
  private pointerVy = 0
  private pointerDirty = false

  constructor(layerId: string, renderer: THREE.WebGPURenderer | null) {
    super(layerId)

    this.cellSizeUniform = uniform(this.cellSize)
    this.displaceAmountUniform = uniform(this.displaceAmount)
    this.intensityUniform = uniform(this.intensity)
    this.logicalWidthUniform = uniform(this.logicalWidth)
    this.logicalHeightUniform = uniform(this.logicalHeight)
    this.gridWUniform = uniform(this.gridW)
    this.gridHUniform = uniform(this.gridH)

    this.buffer = new Float32Array(this.gridW * this.gridH * 4)
    this.trailDataTexture = createTrailTexture(this.gridW, this.gridH, this.buffer)

    this.sourcePlaceholder = new THREE.Texture()

    const domElement =
      (renderer as unknown as { domElement?: HTMLCanvasElement } | null)
        ?.domElement ?? null
    this.canvas = domElement
    if (domElement) {
      this.onPointerMove = (event: PointerEvent) => {
        this.handlePointerMove(event, domElement)
      }
      this.onPointerLeave = () => {
        this.pointerX = null
        this.pointerY = null
        this.pointerDirty = false
      }
      domElement.addEventListener("pointermove", this.onPointerMove)
      domElement.addEventListener("pointerleave", this.onPointerLeave)
      domElement.addEventListener("pointerdown", this.onPointerMove)
    } else {
      this.onPointerMove = null
      this.onPointerLeave = null
    }

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (this.sourceTextureNode) {
      this.sourceTextureNode.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    const w = Math.max(1, width)
    const h = Math.max(1, height)
    if (w === this.logicalWidth && h === this.logicalHeight) return
    this.logicalWidth = w
    this.logicalHeight = h
    this.logicalWidthUniform.value = w
    this.logicalHeightUniform.value = h
    this.recomputeGrid()
  }

  override updateParams(params: LayerParameterValues): void {
    if (typeof params.cellSize === "number") {
      const next = clampNumber(params.cellSize, 2, 256)
      if (next !== this.cellSize) {
        this.cellSize = next
        this.cellSizeUniform.value = next
        this.recomputeGrid()
      }
    }
    if (typeof params.radius === "number") {
      this.radius = clampNumber(params.radius, 0.005, 0.5)
    }
    if (typeof params.decay === "number") {
      this.decay = clampNumber(params.decay, 0.5, 0.9999)
    }
    if (typeof params.displaceAmount === "number") {
      this.displaceAmount = clampNumber(params.displaceAmount, 0, 0.5)
      this.displaceAmountUniform.value = this.displaceAmount
    }
    if (typeof params.intensity === "number") {
      this.intensity = clampNumber(params.intensity, 0, 4)
      this.intensityUniform.value = this.intensity
    }
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override dispose(): void {
    if (this.canvas && this.onPointerMove) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove)
      this.canvas.removeEventListener("pointerdown", this.onPointerMove)
    }
    if (this.canvas && this.onPointerLeave) {
      this.canvas.removeEventListener("pointerleave", this.onPointerLeave)
    }
    this.trailDataTexture.dispose()
    this.sourcePlaceholder.dispose()
    super.dispose()
  }

  protected override beforeRender(_time: number, delta: number): void {
    this.stepTrail(delta)
  }

  protected override buildEffectNode(): Node {
    if (!this.cellSizeUniform) {
      return this.inputNode
    }

    const screenUv = vec2(uv().x, float(1).sub(uv().y))

    const cellWUv = this.cellSizeUniform.div(this.logicalWidthUniform)
    const cellHUv = this.cellSizeUniform.div(this.logicalHeightUniform)
    const cellX = floor(screenUv.x.div(cellWUv))
    const cellY = floor(screenUv.y.div(cellHUv))

    const bufferUv = vec2(
      cellX.add(float(0.5)).div(this.gridWUniform),
      cellY.add(float(0.5)).div(this.gridHUniform)
    )
    const trailSample = tslTexture(this.trailDataTexture, bufferUv)
    this.trailSampleNode = trailSample
    const dir = vec2(trailSample.r, trailSample.g)
    const mag = clamp(float(trailSample.b), float(0), float(1))

    const cellCenterUv = vec2(
      cellX.add(float(0.5)).mul(cellWUv),
      cellY.add(float(0.5)).mul(cellHUv)
    )
    const warpedUv = clamp(
      vec2(
        cellCenterUv.x.add(dir.x.mul(this.displaceAmountUniform)),
        cellCenterUv.y.add(dir.y.mul(this.displaceAmountUniform))
      ),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )

    const sourceNode = tslTexture(this.sourcePlaceholder, warpedUv)
    this.sourceTextureNode = sourceNode

    const alpha = clamp(mag.mul(this.intensityUniform), float(0), float(1))
    return vec4(sourceNode.r, sourceNode.g, sourceNode.b, alpha)
  }

  private recomputeGrid(): void {
    const nextW = Math.max(1, Math.ceil(this.logicalWidth / this.cellSize))
    const nextH = Math.max(1, Math.ceil(this.logicalHeight / this.cellSize))
    if (nextW === this.gridW && nextH === this.gridH) return
    this.gridW = nextW
    this.gridH = nextH
    this.gridWUniform.value = nextW
    this.gridHUniform.value = nextH
    this.buffer = new Float32Array(this.gridW * this.gridH * 4)
    this.trailDataTexture.dispose()
    this.trailDataTexture = createTrailTexture(this.gridW, this.gridH, this.buffer)
    if (this.trailSampleNode) {
      ;(this.trailSampleNode as unknown as { value: THREE.Texture }).value =
        this.trailDataTexture
    }
  }

  private stepTrail(delta: number): void {
    const dt = Math.max(0, Math.min(delta, 0.1))
    const maxAge = this.computeMaxAge()
    for (let i = 0; i < this.pathSize; i++) {
      const idx = (this.pathHead - 1 - i + MAX_PATH_SAMPLES) % MAX_PATH_SAMPLES
      this.pathAge[idx] = (this.pathAge[idx] ?? 0) + dt
    }
    while (this.pathSize > 0) {
      const tailIdx =
        (this.pathHead - this.pathSize + MAX_PATH_SAMPLES) % MAX_PATH_SAMPLES
      if ((this.pathAge[tailIdx] ?? 0) < maxAge) break
      this.pathSize -= 1
    }

    if (this.pointerDirty && this.pointerX !== null && this.pointerY !== null) {
      const lastIdx =
        (this.pathHead - 1 + MAX_PATH_SAMPLES) % MAX_PATH_SAMPLES
      let shouldAppend = true
      if (this.pathSize > 0) {
        const lx = this.pathX[lastIdx] ?? 0
        const ly = this.pathY[lastIdx] ?? 0
        const dx = this.pointerX - lx
        const dy = this.pointerY - ly
        if (dx * dx + dy * dy < MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) {
          shouldAppend = false
        }
      }
      if (shouldAppend) {
        this.pathX[this.pathHead] = this.pointerX
        this.pathY[this.pathHead] = this.pointerY
        this.pathVx[this.pathHead] = this.pointerVx * VELOCITY_AMPLIFY
        this.pathVy[this.pathHead] = this.pointerVy * VELOCITY_AMPLIFY
        this.pathAge[this.pathHead] = 0
        this.pathHead = (this.pathHead + 1) % MAX_PATH_SAMPLES
        this.pathSize = Math.min(this.pathSize + 1, MAX_PATH_SAMPLES)
      }
      this.pointerDirty = false
    }

    this.buffer.fill(0)
    if (this.pathSize > 0) {
      const radiusCells = Math.max(
        1,
        this.radius * Math.min(this.gridW, this.gridH)
      )
      for (let i = this.pathSize - 1; i >= 0; i--) {
        const idx =
          (this.pathHead - 1 - i + MAX_PATH_SAMPLES) % MAX_PATH_SAMPLES
        const ageT = Math.min(1, (this.pathAge[idx] ?? 0) / maxAge)
        if (ageT >= 1) continue
        const lifeAlpha = smoothstep(1, 0.2, ageT)
        if (lifeAlpha <= 0.01) continue
        const lifeRadius = radiusCells * (1 - ageT * (1 - TAIL_RADIUS_FRAC))
        this.stamp(
          this.pathX[idx] ?? 0,
          this.pathY[idx] ?? 0,
          this.pathVx[idx] ?? 0,
          this.pathVy[idx] ?? 0,
          lifeRadius,
          lifeAlpha
        )
      }
    }

    this.trailDataTexture.needsUpdate = true
  }

  private stamp(
    px: number,
    py: number,
    vx: number,
    vy: number,
    radiusCells: number,
    lifeAlpha: number
  ): void {
    const buffer = this.buffer
    const cellPx = px * this.gridW
    const cellPy = py * this.gridH
    const r = Math.max(1, radiusCells)
    const xMin = Math.max(0, Math.floor(cellPx - r))
    const xMax = Math.min(this.gridW - 1, Math.ceil(cellPx + r))
    const yMin = Math.max(0, Math.floor(cellPy - r))
    const yMax = Math.min(this.gridH - 1, Math.ceil(cellPy + r))

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const ddx = x + 0.5 - cellPx
        const ddy = y + 0.5 - cellPy
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d >= r) continue
        const t = 1 - d / r
        const radial = t * t * (3 - 2 * t)
        const alpha = radial * lifeAlpha
        const idx = 4 * (x + this.gridW * y)
        const prev = buffer[idx + 2] ?? 0
        if (alpha > prev) {
          buffer[idx] = vx * alpha
          buffer[idx + 1] = vy * alpha
          buffer[idx + 2] = alpha
        }
      }
    }
  }

  private computeMaxAge(): number {
    return clampNumber(0.15 + (this.decay - 0.5) * 2.7, 0.05, 3)
  }

  private handlePointerMove(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): void {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const ux = localX / rect.width
    const uy = localY / rect.height

    let dx = 0
    let dy = 0
    if (this.pointerX !== null && this.pointerY !== null) {
      dx = ux - this.pointerX
      dy = uy - this.pointerY
    }

    this.pointerX = ux
    this.pointerY = uy
    this.pointerVx = dx
    this.pointerVy = dy
    if (dx !== 0 || dy !== 0) {
      this.pointerDirty = true
    }
  }
}

function createTrailTexture(
  width: number,
  height: number,
  buffer: Float32Array
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    buffer,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.flipY = false
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clampNumber((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
