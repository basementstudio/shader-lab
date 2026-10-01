import {
  acesFilmicToneMapping,
  agxToneMapping,
  clamp,
  float,
  max,
  neutralToneMapping,
  pmremTexture,
  positionView,
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
  clipsFromGltfJson,
  type ModelAnimationSettings,
  type ModelClipInfo,
  modelClipTime,
  readModelAnimation,
  resolveModelClips,
  uniqueClipValues,
} from "@/lib/editor/model-animation"
import {
  MODEL_TONE_MAPPINGS,
  type ModelMaterialId,
  modelMaterialDefaults,
  type ModelToneMappingId,
  resolveModelMaterial,
} from "@/lib/editor/config/model-options"
import {
  configureModelCamera,
  modelRadius,
  readModelFraming,
} from "@/lib/editor/model-framing"
import { ModelContactShadow } from "@/renderer/model-contact-shadow"
import {
  ModelOverrideMaterials,
  type OverrideSettings,
} from "@/renderer/model-materials"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type ModelLoaders = typeof import("@/renderer/model-loaders")
type SvgModule = typeof import("@/renderer/model-svg")
type SvgSource = ReturnType<SvgModule["parseSvg"]>
type RendererInternals = {
  _nodes?: { nodeFrame?: { update(): void } }
  compileAsync(scene: THREE.Scene, camera: THREE.Camera): Promise<void>
  getRenderTarget(): THREE.WebGLRenderTarget | null
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType }
}

const DEG = Math.PI / 180
const FLOOR_SAMPLES = 16384
const POSE_SAMPLES = 24
const POSE_POINTS = 16384
const POSE_TIMES_MAX = 96
const POSE_FLOOR_POINTS = 98304

function samplesFor(width: number, height: number): number {
  return width * height <= 8_400_000 ? 4 : 0
}

let loadersPromise: Promise<ModelLoaders> | null = null
let svgPromise: Promise<SvgModule> | null = null

function modelLoaders(): Promise<ModelLoaders> {
  loadersPromise ??= import("@/renderer/model-loaders")
  return loadersPromise
}

function svgModule(): Promise<SvgModule> {
  svgPromise ??= import("@/renderer/model-svg")
  return svgPromise
}

function readNumber(
  value: unknown,
  fallback: number,
  low: number,
  high: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function readToneMapping(value: unknown): ModelToneMappingId {
  return (
    MODEL_TONE_MAPPINGS.find((entry) => entry.id === value)?.id ?? "neutral"
  )
}

function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

function modelVertices(
  root: THREE.Object3D,
  limit = FLOOR_SAMPLES
): Float32Array {
  const meshes: THREE.Mesh[] = []
  let total = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const position = mesh.isMesh ? mesh.geometry?.attributes.position : null
    if (!position) return
    meshes.push(mesh)
    total += position.count
  })
  const stride = Math.max(1, Math.ceil(total / limit))
  const points: number[] = []
  const vertex = new THREE.Vector3()
  for (const mesh of meshes) {
    const count = mesh.geometry.attributes.position?.count ?? 0
    for (let index = 0; index < count; index += stride) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld)
      points.push(vertex.x, vertex.y, vertex.z)
    }
  }
  return new Float32Array(points)
}

function tightRadius(root: THREE.Object3D, center: THREE.Vector3): number {
  const vertex = new THREE.Vector3()
  let radiusSquared = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const position = mesh.isMesh ? mesh.geometry?.attributes.position : null
    if (!position) return
    for (let index = 0; index < position.count; index += 1) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld)
      radiusSquared = Math.max(radiusSquared, vertex.distanceToSquared(center))
    }
  })
  return Math.sqrt(radiusSquared)
}

function refreshUniformsEveryRender(material: THREE.Material): void {
  ;(material as unknown as Record<string, unknown>).uniformRefreshNode = float(0)
}

function disposeObject(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
      material.dispose()
    }
  })
  for (const texture of textures) texture.dispose()
}

export class ModelPass extends PassNode {
  private readonly renderer: THREE.WebGPURenderer
  private readonly modelScene = new THREE.Scene()
  private readonly modelCamera = new THREE.PerspectiveCamera(27, 1, 0.01, 100)
  private readonly locationGroup = new THREE.Group()
  private readonly spinGroup = new THREE.Group()
  private readonly modelGroup = new THREE.Group()
  private readonly fitGroup = new THREE.Group()
  private readonly keyLight = new THREE.DirectionalLight("#ffffff", 1)
  private readonly rimLight = new THREE.DirectionalLight("#ffffff", 0)
  private readonly floorMaterial = new THREE.ShadowNodeMaterial()
  private readonly floorGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly floor: THREE.Mesh
  private readonly contact = new ModelContactShadow()
  private readonly colorTarget: THREE.WebGLRenderTarget
  private readonly depthTarget: THREE.WebGLRenderTarget
  private readonly sceneDepthTarget: THREE.WebGLRenderTarget
  private readonly backdropTarget: THREE.WebGLRenderTarget
  private readonly backdropScene = new THREE.Scene()
  private readonly backdropMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly backdropGeometry = new THREE.PlaneGeometry(2, 2)
  private readonly backdropInput: Node
  private readonly depthMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly depthCutouts = new Map<
    string,
    THREE.MeshBasicNodeMaterial
  >()
  private readonly depthColor: Node
  private readonly depthNear: Node
  private readonly depthFar: Node
  private readonly composeScene = new THREE.Scene()
  private readonly composeMaterial = new THREE.MeshBasicNodeMaterial()
  private readonly composeGeometry = new THREE.PlaneGeometry(2, 2)
  private readonly incomingDepthPlaceholder = new THREE.Texture()
  private readonly incomingDepthNode: Node
  private readonly hasIncomingDepth: Node
  private readonly exposureUniform: Node
  private readonly clearColor = new THREE.Color()
  private readonly originalMaterials = new Map<
    THREE.Mesh,
    THREE.Material | THREE.Material[]
  >()
  private overrides: ModelOverrideMaterials | null = null
  private materialPreset: ModelMaterialId = "original"
  private toneMapping: ModelToneMappingId = "neutral"
  private wireframe = false
  private params: LayerParameterValues = {}
  private model: THREE.Object3D | null = null
  private modelSignature: string | null = null
  private modelNonce = 0
  private environment: THREE.Texture | null = null
  private environmentNode: Node | null = null
  private environmentSignature: string | null = null
  private environmentNonce = 0
  private environmentNormalization = 1
  private compileGeneration = 0
  private compiling = false
  private pendingCompile: Promise<void> | null = null
  private sceneDirty = true
  private floorKey = ""
  private floorPoints: Float32Array = new Float32Array(0)
  private floorY = -1
  private restFit: { center: THREE.Vector3; points: Float32Array; radius: number } | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clips: THREE.AnimationClip[] = []
  private clipInfo: ModelClipInfo[] = []
  private actions: { action: THREE.AnimationAction; duration: number }[] = []
  private selectionKey = ""
  private animation: ModelAnimationSettings = readModelAnimation({})
  private svg: { module: SvgModule; source: SvgSource } | null = null
  private svgKey = ""
  private spin = 0
  private lastTime = Number.NaN
  private width = 1
  private height = 1
  private targetsCleared = false
  private sceneDepthComposed = false

  constructor(layerId: string, renderer: THREE.WebGPURenderer) {
    super(layerId)
    this.renderer = renderer
    const internals = renderer as unknown as RendererInternals
    internals.shadowMap.enabled = true
    internals.shadowMap.type = THREE.PCFShadowMap

    const colorOptions = {
      depthBuffer: true,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      samples: samplesFor(1, 1),
      type: THREE.HalfFloatType,
    }
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, colorOptions)
    this.depthTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...colorOptions,
      format: THREE.RGFormat,
    })
    this.sceneDepthTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    })

    this.backdropTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    })
    this.backdropInput = tslTexture(new THREE.Texture(), renderTargetUv())
    this.backdropMaterial.blending = THREE.NoBlending
    this.backdropMaterial.colorNode = this.backdropInput
    const backdropMesh = new THREE.Mesh(this.backdropGeometry, this.backdropMaterial)
    backdropMesh.frustumCulled = false
    this.backdropScene.add(backdropMesh)

    this.modelScene.add(this.locationGroup)
    this.locationGroup.add(this.spinGroup)
    this.spinGroup.add(this.modelGroup)
    this.modelGroup.add(this.fitGroup)

    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(2048, 2048)
    this.keyLight.shadow.bias = -0.0005
    this.keyLight.shadow.normalBias = 0.02
    this.modelScene.add(this.keyLight, this.keyLight.target)
    this.rimLight.castShadow = false
    this.modelScene.add(this.rimLight, this.rimLight.target)

    this.floorMaterial.opacity = 0.5
    this.floor = new THREE.Mesh(this.floorGeometry, this.floorMaterial)
    this.floor.rotation.x = -Math.PI / 2
    this.floor.receiveShadow = true
    this.floor.frustumCulled = false
    this.modelScene.add(this.floor, this.contact.mesh)

    this.depthNear = uniform(1)
    this.depthFar = uniform(3)
    const distance = positionView.z.negate()
    const depth = clamp(
      this.depthFar.sub(distance).div(max(this.depthFar.sub(this.depthNear), 1e-4)),
      float(0),
      float(1)
    )
    this.depthMaterial.blending = THREE.NoBlending
    this.depthColor = vec4(depth, 1, 0, 1)
    this.depthMaterial.colorNode = this.depthColor

    this.hasIncomingDepth = uniform(0)
    this.incomingDepthNode = tslTexture(
      this.incomingDepthPlaceholder,
      renderTargetUv()
    )
    const modelDepth = tslTexture(this.depthTarget.texture, renderTargetUv())
    const coverage = clamp(float(modelDepth.g), float(0), float(1))
    const incoming = float(this.incomingDepthNode.r).mul(this.hasIncomingDepth)
    const combined = float(modelDepth.r).add(incoming.mul(float(1).sub(coverage)))
    this.composeMaterial.blending = THREE.NoBlending
    this.composeMaterial.colorNode = vec4(
      combined,
      combined,
      combined,
      max(coverage, float(this.incomingDepthNode.a).mul(this.hasIncomingDepth))
    )
    const composeMesh = new THREE.Mesh(this.composeGeometry, this.composeMaterial)
    composeMesh.frustumCulled = false
    this.composeScene.add(composeMesh)

    this.exposureUniform = uniform(1)
    this.rebuildEffectNode()
  }

  async setModel(source: { format?: "gltf" | "svg"; url: string }): Promise<void> {
    if (this.modelSignature === source.url) {
      return
    }

    this.modelNonce += 1
    const nonce = this.modelNonce
    this.releaseModel()
    this.svg = null
    this.modelSignature = source.url

    try {
      if (source.format === "svg") {
        const [module, response] = await Promise.all([svgModule(), fetch(source.url)])
        const text = await response.text()
        if (nonce !== this.modelNonce) {
          return
        }
        const svg = { module, source: module.parseSvg(text) }
        this.svgKey = this.extrusionKey()
        this.installModel(svg.module.buildSvgModel(svg.source, this.extrusion()), [], [])
        this.svg = svg
        await this.compileScene()
        return
      }

      const { loadGltf } = await modelLoaders()
      const gltf = await loadGltf(source.url, this.renderer)

      if (nonce !== this.modelNonce) {
        disposeObject(gltf.scene)
        return
      }

      this.installModel(
        gltf.scene,
        gltf.animations,
        clipsFromGltfJson((gltf.parser as { json?: unknown } | undefined)?.json)
      )
      await this.compileScene()
    } catch (cause) {
      if (nonce === this.modelNonce) {
        this.modelSignature = null
        this.releaseModel()
      }

      throw cause
    }
  }

  clearModel(): void {
    this.modelNonce += 1
    this.releaseModel()
    this.svg = null
  }

  async setEnvironment(url: string): Promise<void> {
    if (this.environmentSignature === url) {
      return
    }

    this.environmentNonce += 1
    const nonce = this.environmentNonce
    this.environmentSignature = url

    try {
      const { loadEnvironment } = await modelLoaders()
      const { normalization, texture } = await loadEnvironment(url)

      if (nonce !== this.environmentNonce) {
        texture.dispose()
        return
      }

      this.environmentNormalization = normalization
      this.sceneDirty = true
      const previous = this.environment
      this.environment = texture
      this.modelScene.environment = texture

      if (this.environmentNode) {
        this.environmentNode.value = texture
        previous?.dispose()
        return
      }

      this.environmentNode = pmremTexture(texture)
      ;(this.modelScene as unknown as { environmentNode: unknown }).environmentNode =
        this.environmentNode

      if (this.model) {
        await this.compileScene()
      }
    } catch (cause) {
      if (nonce === this.environmentNonce) {
        this.environmentSignature = null
      }

      throw cause
    }
  }

  override updateParams(params: LayerParameterValues): void {
    this.params = params
    this.exposureUniform.value = 2 ** readNumber(params.exposure, 0, -6, 6)
    this.spin = readModelFraming(params).spin
    this.animation = readModelAnimation(params)
    if (this.model) {
      this.applySelection()
    }
    if (this.svg && this.extrusionKey() !== this.svgKey) {
      this.rebuildSvg()
    }

    const toneMapping = readToneMapping(params.toneMapping)
    if (toneMapping !== this.toneMapping) {
      this.toneMapping = toneMapping
      this.rebuildEffectNode()
    }

    const wireframe = params.wireframe === true
    const wireframeChanged = wireframe !== this.wireframe
    this.wireframe = wireframe
    const materialChanged = this.applyMaterial(false)
    if (wireframeChanged && !materialChanged) {
      this.applyWireframe()
    }
    if (materialChanged) {
      void this.compileScene()
    }

    this.sceneDirty = true
  }

  override resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.round(width))
    const nextHeight = Math.max(1, Math.round(height))

    if (nextWidth === this.width && nextHeight === this.height) {
      return
    }

    this.width = nextWidth
    this.height = nextHeight
    const samples = samplesFor(nextWidth, nextHeight)
    this.colorTarget.samples = samples
    this.depthTarget.samples = samples
    this.colorTarget.setSize(nextWidth, nextHeight)
    this.depthTarget.setSize(nextWidth, nextHeight)
    this.sceneDepthTarget.setSize(nextWidth, nextHeight)
    this.backdropTarget.setSize(nextWidth, nextHeight)
    this.sceneDirty = true
    this.targetsCleared = false
    this.sceneDepthComposed = false
  }

  override needsContinuousRender(): boolean {
    return this.model !== null && (this.spin !== 0 || this.isAnimating())
  }

  clipCount(): number {
    return this.clips.length
  }

  override getOutputSceneDepth(): THREE.Texture | null {
    return this.model ? this.sceneDepthTarget.texture : super.getOutputSceneDepth()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.resize(outputTarget.width, outputTarget.height)

    const refracting = this.materialPreset === "glass"
    if (this.model && refracting) {
      this.copyBackdrop(renderer, inputTexture)
    }

    if (this.model && !this.compiling) {
      if ((this.spin !== 0 || this.isAnimating()) && time !== this.lastTime) {
        this.sceneDirty = true
      }
      if (refracting) {
        this.sceneDirty = true
      }

      if (this.sceneDirty) {
        this.lastTime = time
        this.updateScene(time)
        this.drawModel(renderer)
        this.sceneDirty = false
        this.targetsCleared = false
        this.sceneDepthComposed = false
      }
    } else if (!(this.model || this.targetsCleared)) {
      this.clearTargets(renderer)
    }

    if (this.model) {
      this.composeSceneDepth(renderer)
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override dispose(): void {
    this.modelNonce += 1
    this.environmentNonce += 1
    this.releaseModel()
    this.svg = null
    this.environment?.dispose()
    this.environment = null
    this.modelScene.environment = null
    this.contact.dispose()
    this.floorMaterial.dispose()
    this.floorGeometry.dispose()
    this.keyLight.shadow.dispose()
    this.rimLight.dispose()
    this.depthMaterial.dispose()
    this.disposeDepthCutouts()
    this.composeMaterial.dispose()
    this.composeGeometry.dispose()
    this.composeScene.clear()
    this.incomingDepthPlaceholder.dispose()
    this.colorTarget.dispose()
    this.depthTarget.dispose()
    this.sceneDepthTarget.dispose()
    this.backdropTarget.dispose()
    this.backdropMaterial.dispose()
    this.backdropGeometry.dispose()
    this.backdropScene.clear()
    this.modelScene.clear()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.exposureUniform) {
      return this.inputNode
    }

    const sampled = tslTexture(this.colorTarget.texture, renderTargetUv())
    const light = vec3(
      float(sampled.r),
      float(sampled.g),
      float(sampled.b)
    ).mul(this.exposureUniform)
    const mapped = this.toneMap(light)
    const coverage = clamp(
      max(float(sampled.a), max(mapped.x, max(mapped.y, mapped.z))),
      float(0),
      float(1)
    )
    return vec4(
      clamp(mapped.div(max(coverage, float(1e-5))), vec3(0), vec3(1)),
      coverage
    )
  }

  private toneMap(color: Node): Node {
    switch (this.toneMapping) {
      case "aces":
        return acesFilmicToneMapping(color, float(1))
      case "agx":
        return agxToneMapping(color, float(1))
      case "none":
        return clamp(color, vec3(0), vec3(1))
      default:
        return neutralToneMapping(color, float(1))
    }
  }

  private installModel(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    clipInfo: ModelClipInfo[]
  ): void {
    const lights: THREE.Object3D[] = []
    root.traverse((object) => {
      if ((object as THREE.Light).isLight) {
        lights.push(object)
        return
      }
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.frustumCulled = false
      }
      this.originalMaterials.set(mesh, mesh.material)
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        refreshUniformsEveryRender(material)
      }
    })
    for (const light of lights) {
      light.removeFromParent()
    }

    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root, true)

    if (box.isEmpty()) {
      throw new Error("The model has no visible geometry.")
    }

    const center = box.getCenter(new THREE.Vector3())
    this.restFit = {
      center,
      points: modelVertices(root),
      radius: tightRadius(root, center),
    }
    this.fitGroup.add(root)
    this.model = root
    this.clips = animations
    const fallbackValues = uniqueClipValues(animations.map((clip) => clip.name))
    this.clipInfo =
      clipInfo.length === animations.length
        ? clipInfo
        : animations.map((clip, index) => ({
            duration: clip.duration,
            label: clip.name,
            name: fallbackValues[index] ?? clip.name,
            targets: [],
          }))
    this.mixer = animations.length > 0 ? new THREE.AnimationMixer(root) : null
    this.selectionKey = ""
    this.materialPreset = "original"
    this.applyMaterial(true)
    this.applyFit(this.restFit.center, this.restFit.radius, this.restFit.points)
    this.applySelection()
    this.sceneDirty = true
  }

  private applyFit(
    center: THREE.Vector3,
    radius: number,
    points: Float32Array
  ): void {
    const scale = 1 / Math.max(radius, 1e-6)
    this.fitGroup.scale.setScalar(scale)
    this.fitGroup.position.copy(center).multiplyScalar(-scale)
    const fitted = new Float32Array(points.length)
    for (let index = 0; index < points.length; index += 3) {
      fitted[index] = ((points[index] ?? 0) - center.x) * scale
      fitted[index + 1] = ((points[index + 1] ?? 0) - center.y) * scale
      fitted[index + 2] = ((points[index + 2] ?? 0) - center.z) * scale
    }
    this.floorPoints = fitted
    this.floorKey = ""
    if (this.overrides) {
      this.overrides.streakScale.value = scale
    }
  }

  private extrusion(): { bevel: number; bevelSegments: number; depth: number } {
    return {
      bevel: readNumber(this.params.extrudeBevel, 0.02, 0, 0.1),
      bevelSegments: readNumber(this.params.extrudeBevelSegments, 4, 1, 12),
      depth: readNumber(this.params.extrudeDepth, 0.15, 0.01, 2),
    }
  }

  private extrusionKey(): string {
    const { bevel, bevelSegments, depth } = this.extrusion()
    return `${depth}|${bevel}|${bevelSegments}`
  }

  private rebuildSvg(): void {
    const svg = this.svg
    if (!svg) return
    this.svgKey = this.extrusionKey()
    let root: THREE.Group
    try {
      root = svg.module.buildSvgModel(svg.source, this.extrusion())
    } catch {
      return
    }
    const signature = this.modelSignature
    this.releaseModel()
    this.modelSignature = signature
    this.installModel(root, [], [])
    void this.compileScene()
  }

  private isAnimating(): boolean {
    if (
      !(
        this.actions.length > 0 &&
        this.animation.playing &&
        this.animation.speed !== 0
      )
    ) {
      return false
    }
    if (this.animation.repeat === "once" && Number.isFinite(this.lastTime)) {
      const longest = Math.max(...this.actions.map((entry) => entry.duration))
      const elapsed = this.animation.start + this.lastTime * this.animation.speed
      return elapsed < longest
    }
    return true
  }

  private poseTimes(longest: number): number[] {
    const times = new Set<number>()
    for (let step = 0; step < POSE_SAMPLES; step += 1) {
      times.add((longest * step) / (POSE_SAMPLES - 1))
    }
    for (const { action } of this.actions) {
      for (const track of action.getClip().tracks) {
        for (const time of track.times) {
          if (time >= 0 && time <= longest) times.add(time)
        }
      }
    }
    const sorted = [...times].sort((a, b) => a - b)
    if (sorted.length <= POSE_TIMES_MAX) return sorted
    return Array.from(
      { length: POSE_TIMES_MAX },
      (_, index) =>
        sorted[
          Math.round((index * (sorted.length - 1)) / (POSE_TIMES_MAX - 1))
        ] as number
    )
  }

  private applySelection(): void {
    const mixer = this.mixer
    const indices = mixer
      ? resolveModelClips(this.params.animation, this.clipInfo)
      : []
    const key = indices.join(",")
    if (key === this.selectionKey) {
      return
    }
    this.selectionKey = key
    mixer?.stopAllAction()
    this.actions = []
    for (const index of indices) {
      const clip = this.clips[index]
      if (!(clip && mixer)) continue
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY)
      action.play()
      this.actions.push({ action, duration: clip.duration })
    }
    this.fitSelection()
    this.sceneDirty = true
  }

  private fitSelection(): void {
    const root = this.model
    const rest = this.restFit
    if (!(root && rest)) return
    if (this.actions.length === 0 || !this.mixer) {
      if (this.mixer) {
        this.mixer.update(0)
        root.updateMatrixWorld(true)
      }
      this.applyFit(rest.center, rest.radius, rest.points)
      return
    }

    const parent = root.parent
    root.removeFromParent()
    root.updateMatrixWorld(true)
    const longest = Math.max(...this.actions.map((entry) => entry.duration), 0)
    const samples: Float32Array[] = []
    for (const time of this.poseTimes(longest)) {
      for (const { action, duration } of this.actions) {
        action.time = Math.min(time, duration)
      }
      this.mixer.update(0)
      root.updateMatrixWorld(true)
      samples.push(modelVertices(root, POSE_POINTS))
    }
    parent?.add(root)

    const box = new THREE.Box3()
    const vertex = new THREE.Vector3()
    for (const entry of samples) {
      for (let index = 0; index < entry.length; index += 3) {
        box.expandByPoint(
          vertex.set(entry[index] ?? 0, entry[index + 1] ?? 0, entry[index + 2] ?? 0)
        )
      }
    }
    if (box.isEmpty()) {
      this.applyFit(rest.center, rest.radius, rest.points)
      return
    }
    const center = box.getCenter(new THREE.Vector3())
    let radiusSquared = 0
    for (const entry of samples) {
      for (let index = 0; index < entry.length; index += 3) {
        vertex.set(entry[index] ?? 0, entry[index + 1] ?? 0, entry[index + 2] ?? 0)
        radiusSquared = Math.max(radiusSquared, vertex.distanceToSquared(center))
      }
    }

    const total = samples.reduce((sum, entry) => sum + entry.length / 3, 0)
    const keep = Math.max(1, Math.ceil(total / POSE_FLOOR_POINTS))
    const floor: number[] = []
    let counter = 0
    for (const entry of samples) {
      for (let index = 0; index < entry.length; index += 3) {
        if (counter % keep === 0) {
          floor.push(entry[index] ?? 0, entry[index + 1] ?? 0, entry[index + 2] ?? 0)
        }
        counter += 1
      }
    }
    this.applyFit(center, Math.sqrt(radiusSquared), new Float32Array(floor))
  }

  private applyPose(time: number): void {
    if (!this.mixer || this.actions.length === 0) return
    for (const { action, duration } of this.actions) {
      action.time = modelClipTime(this.animation, time, duration)
    }
    this.mixer.update(0)
  }

  private releaseModel(): void {
    this.compileGeneration += 1
    this.compiling = false
    this.pendingCompile = null
    this.floorPoints = new Float32Array(0)
    this.floorKey = ""
    this.mixer?.stopAllAction()
    if (this.model) {
      this.mixer?.uncacheRoot(this.model)
    }
    this.mixer = null
    this.clips = []
    this.clipInfo = []
    this.actions = []
    this.selectionKey = ""
    this.restFit = null
    if (this.model) {
      for (const [mesh, original] of this.originalMaterials) {
        mesh.material = original
      }
      this.fitGroup.remove(this.model)
      disposeObject(this.model)
    }
    this.originalMaterials.clear()
    this.disposeDepthCutouts()
    this.overrides?.dispose()
    this.overrides = null
    this.materialPreset = "original"
    this.model = null
    this.modelSignature = null
    this.targetsCleared = false
  }

  private overrideSettings(): OverrideSettings {
    return {
      color: readColor(this.params.materialColor, "#ffffff"),
      metalness: readNumber(
        this.params.materialMetalness,
        modelMaterialDefaults(this.params.material)?.metalness ?? 1,
        0,
        1
      ),
      roughness: readNumber(this.params.materialRoughness, 0.2, 0, 1),
    }
  }

  private applyWireframe(): void {
    for (const mesh of this.originalMaterials.keys()) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        const wired = material as THREE.Material & { wireframe?: boolean }
        if (wired.wireframe === undefined || wired.wireframe === this.wireframe) {
          continue
        }
        wired.wireframe = this.wireframe
        material.needsUpdate = true
      }
    }
    this.sceneDirty = true
  }

  private applyMaterial(force: boolean): boolean {
    const next = resolveModelMaterial(this.params.material)

    if (!force && next === this.materialPreset) {
      this.overrides?.update(this.overrideSettings())
      return false
    }

    const previous = this.overrides
    this.overrides =
      next === "original"
        ? null
        : new ModelOverrideMaterials(next, this.backdropTarget.texture)
    const settings = this.overrideSettings()

    for (const [mesh, original] of this.originalMaterials) {
      if (!this.overrides) {
        mesh.material = original
        continue
      }
      const overrides = this.overrides
      mesh.material = Array.isArray(original)
        ? original.map((entry) =>
            overrides.materialFor(entry, mesh.geometry, settings)
          )
        : overrides.materialFor(original, mesh.geometry, settings)
    }

    if (this.overrides) {
      this.overrides.streakScale.value = this.fitGroup.scale.x
    }
    this.applyWireframe()
    previous?.dispose()
    this.materialPreset = next
    this.sceneDirty = true
    return this.model !== null
  }

  private async compileScene(): Promise<void> {
    if (!this.model) {
      return
    }

    if (this.wireframe) {
      this.compileGeneration += 1
      this.compiling = false
      this.pendingCompile = null
      this.sceneDirty = true
      return
    }

    this.compileGeneration += 1
    const generation = this.compileGeneration
    this.compiling = true
    this.updateScene(Number.isFinite(this.lastTime) ? this.lastTime : 0)
    const compiler = this.renderer as unknown as RendererInternals
    const previous = compiler.getRenderTarget()
    compiler.setRenderTarget(this.colorTarget)
    const pending = compiler.compileAsync(this.modelScene, this.modelCamera)
    compiler.setRenderTarget(previous)
    this.pendingCompile = pending

    try {
      await pending
    } finally {
      if (generation === this.compileGeneration) {
        this.compiling = false
        this.pendingCompile = null
        this.sceneDirty = true
      }
    }
  }

  async whenCompiled(): Promise<void> {
    while (this.pendingCompile) {
      await this.pendingCompile.catch(() => undefined)
    }
  }

  private updateScene(time: number): void {
    this.applyPose(time)
    const params = this.params
    const framing = readModelFraming(params)
    const [lx, ly, lz] = framing.location
    const [rx, ry, rz] = framing.rotation
    this.locationGroup.position.set(lx, ly, lz)
    this.modelGroup.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ")
    this.modelGroup.scale.set(...framing.scale)
    this.spinGroup.rotation.set(0, 0, 0)

    const floorKey = `${framing.rotation.join(",")}|${framing.scale.join(",")}`
    if (floorKey !== this.floorKey) {
      this.floorKey = floorKey
      this.floorY = this.lowestPoint()
    }

    const floorWorldY = this.floorY + ly
    this.spinGroup.rotation.y = framing.spin * time * DEG
    this.locationGroup.updateMatrixWorld(true)

    const radius = modelRadius(framing)
    const camera = this.modelCamera
    configureModelCamera(camera, framing, this.width, this.height)

    const toModel = camera.position.distanceTo(this.locationGroup.position)
    this.depthNear.value = Math.max(0.001, toModel - radius * 1.02)
    this.depthFar.value = toModel + radius * 1.02

    this.modelScene.environmentIntensity =
      readNumber(params.environmentIntensity, 1, 0, 10) *
      this.environmentNormalization
    this.modelScene.environmentRotation.set(
      0,
      readNumber(params.environmentRotation, 0, -360, 360) * DEG,
      0
    )

    const lightAngle = readNumber(params.lightAngle, 135, -360, 360) * DEG
    const lightElevation = readNumber(params.lightElevation, 45, 1, 90) * DEG
    const direction = new THREE.Vector3(
      Math.cos(lightAngle) * Math.cos(lightElevation),
      Math.sin(lightAngle) * Math.cos(lightElevation),
      Math.sin(lightElevation)
    ).applyQuaternion(camera.quaternion)
    const light = this.keyLight
    light.intensity = readNumber(params.lightIntensity, 1, 0, 20)
    light.color.set(readColor(params.lightColor, "#ffffff"))
    light.target.position.set(lx, floorWorldY + radius, lz)
    light.target.updateMatrixWorld(true)
    light.position.copy(light.target.position).addScaledVector(direction, radius * 8)
    const shadowCamera = light.shadow.camera as THREE.OrthographicCamera
    const reach = radius * 2.6 + Math.abs(ly)
    shadowCamera.left = -reach
    shadowCamera.right = reach
    shadowCamera.top = reach
    shadowCamera.bottom = -reach
    shadowCamera.near = radius * 0.5
    shadowCamera.far = radius * 16 + Math.abs(ly) * 2
    shadowCamera.updateProjectionMatrix()
    light.shadow.radius = 1 + readNumber(params.shadowSoftness, 0.4, 0, 1) * 10

    const rim = this.rimLight
    rim.intensity = readNumber(params.rimLight, 0, 0, 20)
    rim.visible = rim.intensity > 0
    rim.color.set(readColor(params.rimColor, "#ffffff"))
    const rimDirection = new THREE.Vector3(
      -Math.cos(lightAngle) * 0.7,
      0.45,
      -1
    )
      .normalize()
      .applyQuaternion(camera.quaternion)
    rim.target.position.copy(light.target.position)
    rim.target.updateMatrixWorld(true)
    rim.position.copy(rim.target.position).addScaledVector(rimDirection, radius * 8)

    const floorOn = params.floor !== false
    const floorShadow = readNumber(params.floorShadow, 0.5, 0, 1)
    const contactShadow = readNumber(params.contactShadow, 0.6, 0, 1)
    this.floor.visible = floorOn && floorShadow > 0 && light.intensity > 0
    this.floor.position.set(lx, floorWorldY, lz)
    this.floor.scale.set(radius * 80, radius * 80, 1)
    this.floorMaterial.opacity = floorShadow
    this.contact.mesh.visible = floorOn && contactShadow > 0
    this.contact.update({
      blur: readNumber(params.contactBlur, 0.5, 0, 1),
      centerX: lx,
      centerZ: lz,
      extent: radius * 2.2,
      fadeHeight: radius * 1.2,
      floorY: floorWorldY,
      opacity: contactShadow,
    })
  }

  private lowestPoint(): number {
    const points = this.floorPoints
    if (points.length === 0) return -1
    this.modelGroup.updateMatrix()
    const e = this.modelGroup.matrix.elements
    let lowest = Number.POSITIVE_INFINITY
    for (let index = 0; index < points.length; index += 3) {
      const y =
        (e[1] ?? 0) * (points[index] ?? 0) +
        (e[5] ?? 0) * (points[index + 1] ?? 0) +
        (e[9] ?? 0) * (points[index + 2] ?? 0)
      if (y < lowest) lowest = y
    }
    return lowest
  }

  private drawModel(renderer: THREE.WebGPURenderer): void {
    const previousTarget = (renderer as unknown as RendererInternals).getRenderTarget()
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    const floorVisible = this.floor.visible
    const contactVisible = this.contact.mesh.visible
    let swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []

    try {
      renderer.setClearColor(0, 0)
      this.floor.visible = false
      this.contact.mesh.visible = false

      if (contactVisible) {
        this.contact.render(renderer, this.modelScene)
      }

      this.floor.visible = floorVisible
      this.contact.mesh.visible = contactVisible
      this.keyLight.shadow.needsUpdate = true
      ;(renderer as unknown as RendererInternals)._nodes?.nodeFrame?.update()
      renderer.setRenderTarget(this.colorTarget)
      renderer.render(this.modelScene, this.modelCamera)

      this.floor.visible = false
      this.contact.mesh.visible = false
      swapped = this.swapInDepthMaterials()
      renderer.setRenderTarget(this.depthTarget)
      renderer.render(this.modelScene, this.modelCamera)
    } finally {
      for (const [mesh, material] of swapped) {
        mesh.material = material
      }
      this.floor.visible = floorVisible
      this.contact.mesh.visible = contactVisible
      renderer.setClearColor(this.clearColor, alpha)
      renderer.setRenderTarget(previousTarget)
    }
  }

  private swapInDepthMaterials(): [THREE.Mesh, THREE.Material | THREE.Material[]][] {
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    for (const [mesh, original] of this.originalMaterials) {
      swapped.push([mesh, mesh.material])
      const hasUv = mesh.geometry.hasAttribute("uv")
      mesh.material = Array.isArray(original)
        ? original.map((entry) => this.depthMaterialFor(entry, hasUv))
        : this.depthMaterialFor(original, hasUv)
    }
    return swapped
  }

  private depthMaterialFor(
    source: THREE.Material,
    hasUv: boolean
  ): THREE.MeshBasicNodeMaterial {
    const cutout = source as THREE.Material & {
      alphaMap?: THREE.Texture | null
      map?: THREE.Texture | null
    }
    const alphaMap = hasUv ? (cutout.alphaMap ?? null) : null
    const map =
      hasUv && cutout.map && (source.transparent || source.alphaTest > 0)
        ? cutout.map
        : null
    if (!(alphaMap || map)) return this.depthMaterial
    const key = `${source.uuid}:${alphaMap ? 1 : 0}:${map ? 1 : 0}`
    let material = this.depthCutouts.get(key)
    if (!material) {
      material = new THREE.MeshBasicNodeMaterial()
      material.blending = THREE.NoBlending
      material.colorNode = this.depthColor
      material.side = source.side
      material.alphaTest = source.alphaTest > 0 ? source.alphaTest : 0.5
      if (alphaMap) Object.assign(material, { alphaMap })
      if (map) material.opacityNode = tslTexture(map).a
      this.depthCutouts.set(key, material)
    }
    return material
  }

  private disposeDepthCutouts(): void {
    for (const material of this.depthCutouts.values()) {
      material.dispose()
    }
    this.depthCutouts.clear()
  }

  private copyBackdrop(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture
  ): void {
    const previous = (renderer as unknown as RendererInternals).getRenderTarget()
    this.backdropInput.value = inputTexture
    renderer.setRenderTarget(this.backdropTarget)
    renderer.render(this.backdropScene, this.camera)
    renderer.setRenderTarget(previous)
  }

  private composeSceneDepth(renderer: THREE.WebGPURenderer): void {
    const incoming = this.sceneDepthTexture
    if (!incoming && this.sceneDepthComposed) {
      return
    }
    this.incomingDepthNode.value = incoming ?? this.incomingDepthPlaceholder
    this.hasIncomingDepth.value = incoming ? 1 : 0
    renderer.setRenderTarget(this.sceneDepthTarget)
    renderer.render(this.composeScene, this.camera)
    this.sceneDepthComposed = !incoming
  }

  private clearTargets(renderer: THREE.WebGPURenderer): void {
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clearColor)
    try {
      renderer.setClearColor(0, 0)
      for (const target of [this.colorTarget, this.depthTarget]) {
        renderer.setRenderTarget(target)
        renderer.clear()
      }
    } finally {
      renderer.setClearColor(this.clearColor, alpha)
    }
    this.targetsCleared = true
    this.sceneDepthComposed = false
  }
}
