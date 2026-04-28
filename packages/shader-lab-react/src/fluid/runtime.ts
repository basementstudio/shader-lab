// @ts-nocheck
import * as THREE from "three/webgpu"
import * as TSL from "three/tsl"
import {
  clamp,
  createSeededRandom,
  getSimulationSize,
  hexToVector3,
  normalizeShaderLabFluidControls,
  randomVividColor,
} from "./utils"
import type {
  ShaderLabFluidControls,
  ShaderLabFluidRuntimeOptions,
  ShaderLabFluidSplatColor,
} from "./types"

type DoubleRenderTarget = {
  dispose: () => void
  read: THREE.RenderTarget
  swap: () => void
  write: THREE.RenderTarget
}

const RENDER_TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

function createDoubleRenderTarget(
  width: number,
  height: number,
  options: THREE.RenderTargetOptions
): DoubleRenderTarget {
  let read = new THREE.RenderTarget(width, height, options)
  let write = new THREE.RenderTarget(width, height, options)

  return {
    dispose() {
      read.dispose()
      write.dispose()
    },
    get read() {
      return read
    },
    swap() {
      const next = read
      read = write
      write = next
    },
    get write() {
      return write
    },
  }
}

function createFullscreenMaterial(fragmentNode: TSL.TSLNode) {
  const material = new THREE.NodeMaterial()
  material.fragmentNode = fragmentNode
  material.depthTest = false
  material.depthWrite = false
  return material
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas
  }

  throw new Error("ShaderLabFluidRuntime requires a browser canvas context.")
}

export class ShaderLabFluidRuntime {
  private readonly ownsRenderer: boolean
  private renderer: THREE.WebGPURenderer | null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly fullscreenQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.NodeMaterial()
  )

  private width: number
  private height: number
  private pixelRatio: number
  private controls: ShaderLabFluidControls
  private random: () => number
  private lastInteractionAt = 0
  private idleAccumulator = 0
  private idleAngle = 0
  private running = false
  private readyState = false
  private disposed = false
  private initPromise: Promise<void> | null = null

  private simSize = { height: 1, width: 1 }
  private dyeSize = { height: 1, width: 1 }

  private velocity: DoubleRenderTarget | null = null
  private density: DoubleRenderTarget | null = null
  private pressure: DoubleRenderTarget | null = null
  private divergence: THREE.RenderTarget | null = null
  private curl: THREE.RenderTarget | null = null
  private displayTarget: THREE.RenderTarget | null = null

  private clearMaterial: THREE.NodeMaterial | null = null
  private splatMaterial: THREE.NodeMaterial | null = null
  private velocityAdvectionMaterial: THREE.NodeMaterial | null = null
  private densityAdvectionMaterial: THREE.NodeMaterial | null = null
  private divergenceMaterial: THREE.NodeMaterial | null = null
  private curlMaterial: THREE.NodeMaterial | null = null
  private vorticityMaterial: THREE.NodeMaterial | null = null
  private pressureMaterial: THREE.NodeMaterial | null = null
  private gradientSubtractMaterial: THREE.NodeMaterial | null = null
  private displayMaterial: THREE.NodeMaterial | null = null

  private readonly texelSizeNode = TSL.uniform(new THREE.Vector2(1, 1))
  private readonly dyeTexelSizeNode = TSL.uniform(new THREE.Vector2(1, 1))
  private readonly aspectRatioNode = TSL.uniform(1)
  private readonly splatColorNode = TSL.uniform(new THREE.Vector3())
  private readonly splatPointNode = TSL.uniform(new THREE.Vector2())
  private readonly splatRadiusNode = TSL.uniform(0.01)
  private readonly deltaTimeNode = TSL.uniform(1 / 60)
  private readonly dissipationNode = TSL.uniform(1)
  private readonly pressureDissipationNode = TSL.uniform(0)
  private readonly curlStrengthNode = TSL.uniform(30)
  private readonly exposureNode = TSL.uniform(1.6)
  private readonly colorModeNode = TSL.uniform(0)
  private readonly monoDarkNode = TSL.uniform(new THREE.Vector3())
  private readonly monoLightNode = TSL.uniform(new THREE.Vector3())
  private readonly duotoneDarkNode = TSL.uniform(new THREE.Vector3())
  private readonly duotoneLightNode = TSL.uniform(new THREE.Vector3())

  private clearTextureNode: TSL.TSLNode | null = null
  private splatTargetNode: TSL.TSLNode | null = null
  private advectionVelocityNode: TSL.TSLNode | null = null
  private advectionSourceNode: TSL.TSLNode | null = null
  private divergenceVelocityNode: TSL.TSLNode | null = null
  private curlVelocityNode: TSL.TSLNode | null = null
  private vorticityVelocityNode: TSL.TSLNode | null = null
  private vorticityCurlNode: TSL.TSLNode | null = null
  private pressureTextureNode: TSL.TSLNode | null = null
  private pressureDivergenceNode: TSL.TSLNode | null = null
  private gradientPressureNode: TSL.TSLNode | null = null
  private gradientVelocityNode: TSL.TSLNode | null = null
  private displayTextureNode: TSL.TSLNode | null = null

  constructor(options?: ShaderLabFluidRuntimeOptions) {
    this.width = Math.max(1, Math.round(options?.width ?? 1))
    this.height = Math.max(1, Math.round(options?.height ?? 1))
    this.pixelRatio = options?.pixelRatio ?? 1
    this.controls = normalizeShaderLabFluidControls(options?.controls)
    this.random = createSeededRandom(this.controls.seed)
    this.idleAngle = this.random() * Math.PI * 2

    this.ownsRenderer = !options?.renderer
    this.renderer = options?.renderer ?? null

    this.fullscreenQuad.frustumCulled = false
    this.scene.add(this.fullscreenQuad)
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize(): Promise<void> {
    if (this.disposed) {
      return
    }

    if (!this.renderer) {
      this.renderer = new THREE.WebGPURenderer({
        alpha: false,
        antialias: false,
        canvas: createCanvas(this.width, this.height),
        powerPreference: "high-performance",
      })
      await this.renderer.init()
    }

    if (this.disposed || !this.renderer) {
      return
    }

    if (this.ownsRenderer) {
      this.renderer.setPixelRatio(this.pixelRatio)
      this.renderer.setSize(this.width, this.height, false)
    }

    this.buildMaterials()
    this.rebuildTargets()
    this.readyState = true
  }

  start(): void {
    this.running = true
  }

  stop(): void {
    this.running = false
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    if (pixelRatio !== undefined) {
      this.pixelRatio = pixelRatio
    }

    if (this.ownsRenderer && this.renderer) {
      this.renderer.setPixelRatio(this.pixelRatio)
      this.renderer.setSize(this.width, this.height, false)
    }

    if (this.readyState) {
      this.rebuildTargets()
    }
  }

  updateControls(next: Partial<ShaderLabFluidControls>): void {
    const previous = this.controls
    this.controls = normalizeShaderLabFluidControls({
      ...this.controls,
      ...next,
    })

    if (!this.readyState) {
      return
    }

    this.applyDerivedUniforms()

    if (
      previous.seed !== this.controls.seed ||
      previous.simRes !== this.controls.simRes ||
      previous.dyeRes !== this.controls.dyeRes
    ) {
      this.rebuildTargets()
    }
  }

  step(deltaSeconds: number): void {
    if (
      !(this.readyState && this.renderer && this.running) ||
      this.controls.paused ||
      this.disposed ||
      !this.velocity ||
      !this.density ||
      !this.pressure ||
      !this.divergence ||
      !this.curl ||
      !this.displayTarget ||
      !this.clearMaterial ||
      !this.splatMaterial ||
      !this.velocityAdvectionMaterial ||
      !this.densityAdvectionMaterial ||
      !this.divergenceMaterial ||
      !this.curlMaterial ||
      !this.vorticityMaterial ||
      !this.pressureMaterial ||
      !this.gradientSubtractMaterial ||
      !this.displayMaterial ||
      !this.clearTextureNode ||
      !this.advectionVelocityNode ||
      !this.advectionSourceNode ||
      !this.divergenceVelocityNode ||
      !this.curlVelocityNode ||
      !this.vorticityVelocityNode ||
      !this.vorticityCurlNode ||
      !this.pressureTextureNode ||
      !this.pressureDivergenceNode ||
      !this.gradientPressureNode ||
      !this.gradientVelocityNode ||
      !this.displayTextureNode
    ) {
      return
    }

    const dt = clamp(deltaSeconds, 1 / 240, 1 / 20)
    this.maybeInjectIdle(dt)

    this.withRendererState(() => {
      this.curlVelocityNode.value = this.velocity!.read.texture
      this.renderPass(this.curlMaterial!, this.curl!)

      this.vorticityVelocityNode.value = this.velocity!.read.texture
      this.vorticityCurlNode.value = this.curl!.texture
      this.deltaTimeNode.value = dt
      this.renderPass(this.vorticityMaterial!, this.velocity!.write)
      this.velocity!.swap()

      this.divergenceVelocityNode.value = this.velocity!.read.texture
      this.renderPass(this.divergenceMaterial!, this.divergence!)

      this.clearTextureNode.value = this.pressure!.read.texture
      this.renderPass(this.clearMaterial!, this.pressure!.write)
      this.pressure!.swap()

      this.pressureDivergenceNode.value = this.divergence!.texture
      for (let index = 0; index < this.controls.iterations; index += 1) {
        this.pressureTextureNode.value = this.pressure!.read.texture
        this.renderPass(this.pressureMaterial!, this.pressure!.write)
        this.pressure!.swap()
      }

      this.gradientPressureNode.value = this.pressure!.read.texture
      this.gradientVelocityNode.value = this.velocity!.read.texture
      this.renderPass(this.gradientSubtractMaterial!, this.velocity!.write)
      this.velocity!.swap()

      this.deltaTimeNode.value = dt
      this.advectionVelocityNode.value = this.velocity!.read.texture
      this.advectionSourceNode.value = this.velocity!.read.texture
      this.dissipationNode.value = this.controls.velocityDissipation
      this.renderPass(this.velocityAdvectionMaterial!, this.velocity!.write)
      this.velocity!.swap()

      this.advectionVelocityNode.value = this.velocity!.read.texture
      this.advectionSourceNode.value = this.density!.read.texture
      this.dissipationNode.value = this.controls.densityDissipation
      this.renderPass(this.densityAdvectionMaterial!, this.density!.write)
      this.density!.swap()

      this.displayTextureNode.value = this.density!.read.texture
      this.renderPass(this.displayMaterial!, this.displayTarget!)
    })
  }

  splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    color?: ShaderLabFluidSplatColor
  ): void {
    if (
      !(this.readyState && this.renderer && this.velocity && this.density) ||
      !this.splatMaterial ||
      !this.splatTargetNode
    ) {
      return
    }

    this.lastInteractionAt = performance.now()
    this.splatPointNode.value.set(x, y)

    this.withRendererState(() => {
      this.splatTargetNode!.value = this.velocity!.read.texture
      this.splatColorNode.value.set(dx, dy, 0)
      this.renderPass(this.splatMaterial!, this.velocity!.write)
      this.velocity!.swap()

      this.splatTargetNode!.value = this.density!.read.texture
      const dye = color ?? randomVividColor(this.random)
      this.splatColorNode.value.set(dye.r, dye.g, dye.b)
      this.renderPass(this.splatMaterial!, this.density!.write)
      this.density!.swap()
    })
  }

  reset(): void {
    if (!this.readyState) {
      return
    }

    this.rebuildTargets()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.running = false
    this.readyState = false
    this.disposeTargets()
    this.disposeMaterials()
    this.fullscreenQuad.geometry.dispose()
    ;(this.fullscreenQuad.material as THREE.Material).dispose()

    if (this.ownsRenderer) {
      this.renderer?.dispose()
    }

    this.renderer = null
  }

  get isReady(): boolean {
    return this.readyState
  }

  get isRunning(): boolean {
    return this.running
  }

  get outputTexture(): THREE.Texture | null {
    return this.displayTarget?.texture ?? null
  }

  get simulationTexture(): THREE.Texture | null {
    return this.density?.read.texture ?? null
  }

  get currentControls(): ShaderLabFluidControls {
    return this.controls
  }

  private buildMaterials(): void {
    const passUvNode = TSL.uv()

    const sampleRenderTargetUv = (uvNode: TSL.TSLNode) =>
      TSL.vec2(uvNode.x, TSL.float(1).sub(uvNode.y))

    const bilerp = (
      textureNode: TSL.TSLNode,
      coord: TSL.TSLNode,
      texelSize: TSL.TSLNode
    ) => {
      const st = coord.div(texelSize).sub(0.5)
      const iuv = st.floor()
      const fuv = st.fract()

      const a = textureNode.sample(
        sampleRenderTargetUv(iuv.add(TSL.vec2(0.5, 0.5)).mul(texelSize))
      )
      const b = textureNode.sample(
        sampleRenderTargetUv(iuv.add(TSL.vec2(1.5, 0.5)).mul(texelSize))
      )
      const c = textureNode.sample(
        sampleRenderTargetUv(iuv.add(TSL.vec2(0.5, 1.5)).mul(texelSize))
      )
      const d = textureNode.sample(
        sampleRenderTargetUv(iuv.add(TSL.vec2(1.5, 1.5)).mul(texelSize))
      )

      return TSL.mix(TSL.mix(a, b, fuv.x), TSL.mix(c, d, fuv.x), fuv.y)
    }

    const makeSampleNode = () => TSL.texture(new THREE.Texture())

    this.clearTextureNode = makeSampleNode()
    this.splatTargetNode = makeSampleNode()
    this.advectionVelocityNode = makeSampleNode()
    this.advectionSourceNode = makeSampleNode()
    this.divergenceVelocityNode = makeSampleNode()
    this.curlVelocityNode = makeSampleNode()
    this.vorticityVelocityNode = makeSampleNode()
    this.vorticityCurlNode = makeSampleNode()
    this.pressureTextureNode = makeSampleNode()
    this.pressureDivergenceNode = makeSampleNode()
    this.gradientPressureNode = makeSampleNode()
    this.gradientVelocityNode = makeSampleNode()
    this.displayTextureNode = makeSampleNode()

    const clearPassNode = TSL.Fn(() =>
      this.clearTextureNode!.sample(sampleRenderTargetUv(passUvNode)).mul(
        this.pressureDissipationNode
      )
    )()

    const splatPassNode = TSL.Fn(() => {
      const delta = passUvNode.sub(this.splatPointNode)
      const splatDelta = TSL.vec2(delta.x.mul(this.aspectRatioNode), delta.y)
      const splat = splatDelta
        .dot(splatDelta)
        .negate()
        .div(this.splatRadiusNode)
        .exp()
        .mul(this.splatColorNode)
      const base = this.splatTargetNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).xyz

      return TSL.vec4(base.add(splat), 1)
    })()

    const velocityAdvectionPassNode = TSL.Fn(() => {
      const velocitySample = bilerp(
        this.advectionVelocityNode!,
        passUvNode,
        this.texelSizeNode
      ).xy
      const nextCoord = passUvNode.sub(
        velocitySample.mul(this.texelSizeNode).mul(this.deltaTimeNode)
      )
      const result = bilerp(
        this.advectionSourceNode!,
        nextCoord,
        this.texelSizeNode
      )
      const decay = TSL.float(1).add(
        this.dissipationNode.mul(this.deltaTimeNode)
      )

      return result.div(decay)
    })()

    const densityAdvectionPassNode = TSL.Fn(() => {
      const velocitySample = bilerp(
        this.advectionVelocityNode!,
        passUvNode,
        this.texelSizeNode
      ).xy
      const nextCoord = passUvNode.sub(
        velocitySample.mul(this.texelSizeNode).mul(this.deltaTimeNode)
      )
      const result = bilerp(
        this.advectionSourceNode!,
        nextCoord,
        this.dyeTexelSizeNode
      )
      const decay = TSL.float(1).add(
        this.dissipationNode.mul(this.deltaTimeNode)
      )

      return result.div(decay)
    })()

    const divergencePassNode = TSL.Fn(() => {
      const leftCoord = passUvNode.sub(TSL.vec2(this.texelSizeNode.x, 0))
      const rightCoord = passUvNode.add(TSL.vec2(this.texelSizeNode.x, 0))
      const topCoord = passUvNode.add(TSL.vec2(0, this.texelSizeNode.y))
      const bottomCoord = passUvNode.sub(TSL.vec2(0, this.texelSizeNode.y))

      const left = this.divergenceVelocityNode!.sample(
        sampleRenderTargetUv(leftCoord)
      ).x.toVar()
      const right = this.divergenceVelocityNode!.sample(
        sampleRenderTargetUv(rightCoord)
      ).x.toVar()
      const top = this.divergenceVelocityNode!.sample(
        sampleRenderTargetUv(topCoord)
      ).y.toVar()
      const bottom = this.divergenceVelocityNode!.sample(
        sampleRenderTargetUv(bottomCoord)
      ).y.toVar()
      const center = this.divergenceVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).xy

      TSL.If(leftCoord.x.lessThan(0), () => {
        left.assign(center.x.negate())
      })
      TSL.If(rightCoord.x.greaterThan(1), () => {
        right.assign(center.x.negate())
      })
      TSL.If(topCoord.y.greaterThan(1), () => {
        top.assign(center.y.negate())
      })
      TSL.If(bottomCoord.y.lessThan(0), () => {
        bottom.assign(center.y.negate())
      })

      return TSL.vec4(
        TSL.float(0.5).mul(right.sub(left).add(top.sub(bottom))),
        0,
        0,
        1
      )
    })()

    const curlPassNode = TSL.Fn(() => {
      const left = this.curlVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(this.texelSizeNode.x, 0)))
      ).y
      const right = this.curlVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(this.texelSizeNode.x, 0)))
      ).y
      const top = this.curlVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const bottom = this.curlVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(0, this.texelSizeNode.y)))
      ).x

      return TSL.vec4(
        TSL.float(0.5).mul(right.sub(left).sub(top).add(bottom)),
        0,
        0,
        1
      )
    })()

    const vorticityPassNode = TSL.Fn(() => {
      const left = this.vorticityCurlNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const right = this.vorticityCurlNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const top = this.vorticityCurlNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const bottom = this.vorticityCurlNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const center = this.vorticityCurlNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).x

      const forceGradient = TSL.vec2(
        top.abs().sub(bottom.abs()),
        right.abs().sub(left.abs())
      ).mul(0.5)
      const correctedForce = TSL.vec2(
        forceGradient
          .div(forceGradient.length().add(0.0001))
          .mul(this.curlStrengthNode)
          .mul(center).x,
        forceGradient
          .div(forceGradient.length().add(0.0001))
          .mul(this.curlStrengthNode)
          .mul(center)
          .y.negate()
      )
      const velocitySample = this.vorticityVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).xy
      const nextVelocity = TSL.min(
        TSL.max(
          velocitySample.add(correctedForce.mul(this.deltaTimeNode)),
          TSL.vec2(-1000)
        ),
        TSL.vec2(1000)
      )

      return TSL.vec4(nextVelocity, 0, 1)
    })()

    const pressurePassNode = TSL.Fn(() => {
      const left = this.pressureTextureNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const right = this.pressureTextureNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const top = this.pressureTextureNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const bottom = this.pressureTextureNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const divergenceSample = this.pressureDivergenceNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).x

      return TSL.vec4(
        left.add(right).add(bottom).add(top).sub(divergenceSample).mul(0.25),
        0,
        0,
        1
      )
    })()

    const gradientSubtractPassNode = TSL.Fn(() => {
      const left = this.gradientPressureNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const right = this.gradientPressureNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(this.texelSizeNode.x, 0)))
      ).x
      const top = this.gradientPressureNode!.sample(
        sampleRenderTargetUv(passUvNode.add(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const bottom = this.gradientPressureNode!.sample(
        sampleRenderTargetUv(passUvNode.sub(TSL.vec2(0, this.texelSizeNode.y)))
      ).x
      const velocitySample = this.gradientVelocityNode!.sample(
        sampleRenderTargetUv(passUvNode)
      ).xy

      return TSL.vec4(
        velocitySample.sub(TSL.vec2(right.sub(left), top.sub(bottom))),
        0,
        1
      )
    })()

    const displayColorAt = TSL.Fn(([uvNode]: [TSL.TSLNode]) =>
      TSL.vec3(1)
        .sub(
          this.displayTextureNode!.sample(sampleRenderTargetUv(uvNode))
            .rgb.mul(this.exposureNode)
            .negate()
            .exp()
        )
        .pow(0.85)
    )

    const lumaAt = TSL.Fn(([colorNode]: [TSL.TSLNode]) =>
      colorNode.dot(TSL.vec3(0.299, 0.587, 0.114))
    )

    const displayPassNode = TSL.Fn(() => {
      const sourceColor = displayColorAt(passUvNode)
      const luma = lumaAt(sourceColor)
      const finalColor = sourceColor.toVar()

      TSL.If(this.colorModeNode.lessThan(0.5), () => {
        finalColor.assign(TSL.mix(this.monoDarkNode, this.monoLightNode, luma))
      })
        .ElseIf(this.colorModeNode.lessThan(1.5), () => {
          finalColor.assign(
            TSL.mix(this.duotoneDarkNode, this.duotoneLightNode, luma)
          )
        })
        .Else(() => {
          finalColor.assign(sourceColor)
        })

      return TSL.vec4(finalColor, 1)
    })()

    this.clearMaterial = createFullscreenMaterial(clearPassNode)
    this.splatMaterial = createFullscreenMaterial(splatPassNode)
    this.velocityAdvectionMaterial = createFullscreenMaterial(
      velocityAdvectionPassNode
    )
    this.densityAdvectionMaterial = createFullscreenMaterial(
      densityAdvectionPassNode
    )
    this.divergenceMaterial = createFullscreenMaterial(divergencePassNode)
    this.curlMaterial = createFullscreenMaterial(curlPassNode)
    this.vorticityMaterial = createFullscreenMaterial(vorticityPassNode)
    this.pressureMaterial = createFullscreenMaterial(pressurePassNode)
    this.gradientSubtractMaterial = createFullscreenMaterial(
      gradientSubtractPassNode
    )
    this.displayMaterial = createFullscreenMaterial(displayPassNode)
  }

  private renderPass(
    material: THREE.NodeMaterial,
    target: THREE.RenderTarget | null
  ): void {
    if (!this.renderer) {
      return
    }

    this.fullscreenQuad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
  }

  private rebuildTargets(): void {
    if (!this.renderer) {
      return
    }

    this.disposeTargets()

    const aspectRatio = this.width / this.height
    this.simSize = getSimulationSize(this.controls.simRes, aspectRatio)
    this.dyeSize = getSimulationSize(this.controls.dyeRes, aspectRatio)

    this.velocity = createDoubleRenderTarget(
      this.simSize.width,
      this.simSize.height,
      RENDER_TARGET_OPTIONS
    )
    this.density = createDoubleRenderTarget(
      this.dyeSize.width,
      this.dyeSize.height,
      {
        ...RENDER_TARGET_OPTIONS,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
      }
    )
    this.pressure = createDoubleRenderTarget(
      this.simSize.width,
      this.simSize.height,
      RENDER_TARGET_OPTIONS
    )
    this.divergence = new THREE.RenderTarget(
      this.simSize.width,
      this.simSize.height,
      RENDER_TARGET_OPTIONS
    )
    this.curl = new THREE.RenderTarget(
      this.simSize.width,
      this.simSize.height,
      RENDER_TARGET_OPTIONS
    )
    this.displayTarget = new THREE.RenderTarget(this.width, this.height, {
      ...RENDER_TARGET_OPTIONS,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    })

    this.applyDerivedUniforms()
    this.random = createSeededRandom(this.controls.seed)
    this.idleAngle = this.random() * Math.PI * 2

    this.withRendererState(() => {
      this.clearRenderTarget(this.velocity!.read)
      this.clearRenderTarget(this.velocity!.write)
      this.clearRenderTarget(this.density!.read)
      this.clearRenderTarget(this.density!.write)
      this.clearRenderTarget(this.pressure!.read)
      this.clearRenderTarget(this.pressure!.write)
      this.clearRenderTarget(this.divergence!)
      this.clearRenderTarget(this.curl!)
      this.clearRenderTarget(this.displayTarget!)
      this.renderer!.setRenderTarget(null)
      this.seedInitialSplats()
    })
  }

  private clearRenderTarget(target: THREE.RenderTarget | null): void {
    if (!this.renderer) {
      return
    }

    this.renderer.setRenderTarget(target)
    this.renderer.clear()
  }

  private seedInitialSplats(): void {
    for (let index = 0; index < 8; index += 1) {
      const x = 0.15 + this.random() * 0.7
      const y = 0.2 + this.random() * 0.6
      const angle = this.random() * Math.PI * 2
      const force = 800 + this.random() * 600
      this.splat(
        x,
        y,
        Math.cos(angle) * force,
        Math.sin(angle) * force,
        randomVividColor(this.random)
      )
    }
  }

  private maybeInjectIdle(deltaSeconds: number): void {
    if (!this.controls.autoSplats) {
      return
    }

    const now = performance.now()
    if (now - this.lastInteractionAt < 1500) {
      return
    }

    this.idleAngle += deltaSeconds * 0.9
    this.idleAccumulator += deltaSeconds

    if (this.idleAccumulator < 1) {
      return
    }

    this.idleAccumulator = 0
    const x = 0.5 + Math.cos(this.idleAngle * 0.92) * 0.28
    const y = 0.5 + Math.sin(this.idleAngle * 1.17) * 0.22
    const force = 2500
    const tangent = this.idleAngle + Math.PI * 0.5
    const dx = Math.cos(tangent) * force
    const dy = Math.sin(tangent) * force
    this.splat(x, y, dx, dy, randomVividColor(this.random))
  }

  private applyDerivedUniforms(): void {
    this.texelSizeNode.value.set(
      1 / this.simSize.width,
      1 / this.simSize.height
    )
    this.dyeTexelSizeNode.value.set(
      1 / this.dyeSize.width,
      1 / this.dyeSize.height
    )
    this.aspectRatioNode.value = this.width / this.height
    this.splatRadiusNode.value = this.controls.radius / 100
    this.curlStrengthNode.value = this.controls.curlStrength
    this.pressureDissipationNode.value = this.controls.pressureDissipation
    this.exposureNode.value = this.controls.brightness

    let colorMode = 0
    if (this.controls.colorMode === "duotone") {
      colorMode = 1
    } else if (this.controls.colorMode === "source") {
      colorMode = 2
    }
    this.colorModeNode.value = colorMode
    this.monoDarkNode.value.copy(hexToVector3(this.controls.monoDark))
    this.monoLightNode.value.copy(hexToVector3(this.controls.monoLight))
    this.duotoneDarkNode.value.copy(hexToVector3(this.controls.duotoneDark))
    this.duotoneLightNode.value.copy(hexToVector3(this.controls.duotoneLight))
  }

  private withRendererState(callback: () => void): void {
    if (!this.renderer) {
      return
    }

    const sharedRenderer = this.renderer as unknown as {
      getRenderTarget?: () => THREE.RenderTarget | null
      getScissor?: (target: THREE.Vector4) => THREE.Vector4
      getScissorTest?: () => boolean
      getViewport?: (target: THREE.Vector4) => THREE.Vector4
      setRenderTarget: (target: THREE.RenderTarget | null) => void
      setScissor?: (scissor: THREE.Vector4) => void
      setScissorTest?: (enabled: boolean) => void
      setViewport?: (viewport: THREE.Vector4) => void
    }

    const previousRenderTarget = sharedRenderer.getRenderTarget?.() ?? null
    const previousScissor = new THREE.Vector4()
    const previousViewport = new THREE.Vector4()
    const previousScissorTest = sharedRenderer.getScissorTest?.() ?? false
    sharedRenderer.getScissor?.(previousScissor)
    sharedRenderer.getViewport?.(previousViewport)

    try {
      callback()
    } finally {
      sharedRenderer.setRenderTarget(previousRenderTarget)
      sharedRenderer.setScissor?.(previousScissor)
      sharedRenderer.setViewport?.(previousViewport)
      sharedRenderer.setScissorTest?.(previousScissorTest)
    }
  }

  private disposeTargets(): void {
    this.velocity?.dispose()
    this.density?.dispose()
    this.pressure?.dispose()
    this.divergence?.dispose()
    this.curl?.dispose()
    this.displayTarget?.dispose()
    this.velocity = null
    this.density = null
    this.pressure = null
    this.divergence = null
    this.curl = null
    this.displayTarget = null
  }

  private disposeMaterials(): void {
    this.clearMaterial?.dispose()
    this.splatMaterial?.dispose()
    this.velocityAdvectionMaterial?.dispose()
    this.densityAdvectionMaterial?.dispose()
    this.divergenceMaterial?.dispose()
    this.curlMaterial?.dispose()
    this.vorticityMaterial?.dispose()
    this.pressureMaterial?.dispose()
    this.gradientSubtractMaterial?.dispose()
    this.displayMaterial?.dispose()
    this.clearMaterial = null
    this.splatMaterial = null
    this.velocityAdvectionMaterial = null
    this.densityAdvectionMaterial = null
    this.divergenceMaterial = null
    this.curlMaterial = null
    this.vorticityMaterial = null
    this.pressureMaterial = null
    this.gradientSubtractMaterial = null
    this.displayMaterial = null
  }
}

export async function createShaderLabFluidRuntime(
  options?: ShaderLabFluidRuntimeOptions
): Promise<ShaderLabFluidRuntime> {
  const runtime = new ShaderLabFluidRuntime(options)
  await runtime.initialize()
  return runtime
}
