import * as THREE from "three/webgpu"
import { float, texture as tslTexture, type TSLNode, uniform, uv, vec2 } from "three/tsl"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js"
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js"
import type { RenderableLayerPass } from "@/renderer/contracts"
import {
  buildCustomModelMaterial,
  type LiquidMaterialState,
  type ModelMaterialState,
} from "@/renderer/model-materials"
import { buildSvgBadgeGeometry } from "@/renderer/model-svg"
import { PassNode } from "@/renderer/pass-node"
import { useLayerStore } from "@/store/layer-store"
import type { LayerParameterValues } from "@/types/editor"
import {
  MODEL_LAYER_SUPPORTED_MODEL_EXTENSIONS,
  MODEL_LAYER_SUPPORTED_MODEL_MIME_TYPES,
} from "@/lib/editor/model-layer/shared"

type Node = TSLNode
type BackgroundMode = "solid" | "transparent"
type GeometrySource = "model" | "svg-badge"
type MaterialPreset = "liquid" | "metal" | "plastic"
type MaterialMode = "custom" | "source"

const MODEL_RT_OPTIONS = {
  depthBuffer: true,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

const loader = new GLTFLoader()
const hdrLoader = new HDRLoader()

const HDRI_CDN_BASE =
  "https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/"

const HDRI_PRESET_FILES: Record<string, string> = {
  studio: "studio_small_03_1k.hdr",
  sunset: "venice_sunset_1k.hdr",
  warehouse: "empty_warehouse_01_1k.hdr",
  night: "dikhololo_night_1k.hdr",
}

const hdriCache = new Map<string, THREE.Texture>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toVec3(
  value: unknown,
  fallback: readonly [number, number, number]
): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number")
  ) {
    return [
      value[0] ?? fallback[0],
      value[1] ?? fallback[1],
      value[2] ?? fallback[2],
    ]
  }

  return [fallback[0], fallback[1], fallback[2]]
}

function resolveMaterialPreset(preset: string): {
  brilliance: number
  color: string
  metalness: number
  roughness: number
} {
  switch (preset) {
    case "plastic":
      return {
        brilliance: 0.72,
        color: "#ff6f4d",
        metalness: 0,
        roughness: 0.18,
      }
    case "liquid":
      return {
        brilliance: 1.0,
        color: "#c0c0c0",
        metalness: 1,
        roughness: 0.1,
      }
    default:
      return {
        brilliance: 1.0,
        color: "#FAFAFA",
        metalness: 1,
        roughness: 0.04,
      }
  }
}

function normalizeGeometrySource(value: unknown): GeometrySource {
  return value === "svg-badge" ? "svg-badge" : "model"
}

function normalizeBackgroundMode(value: unknown): BackgroundMode {
  return value === "solid" ? "solid" : "transparent"
}

function normalizeMaterialPreset(value: unknown): MaterialPreset {
  if (value === "plastic") return "plastic"
  if (value === "liquid") return "liquid"
  return "metal"
}

function normalizeMaterialMode(value: unknown): MaterialMode {
  return value === "source" ? "source" : "custom"
}

function supportsModelAsset(fileName: string, mimeType: string): boolean {
  const normalizedFileName = fileName.toLowerCase()
  const normalizedMimeType = mimeType.toLowerCase()

  return (
    MODEL_LAYER_SUPPORTED_MODEL_EXTENSIONS.some((extension) =>
      normalizedFileName.endsWith(extension)
    ) || MODEL_LAYER_SUPPORTED_MODEL_MIME_TYPES.has(normalizedMimeType)
  )
}

function normalizeObjectToUnitBounds(object: THREE.Object3D): THREE.Group {
  const bounds = new THREE.Box3().setFromObject(object)
  const wrapper = new THREE.Group()

  if (bounds.isEmpty()) {
    wrapper.add(object)
    return wrapper
  }

  const size = new THREE.Vector3()
  bounds.getSize(size)
  const maxDimension = Math.max(size.x, size.y, size.z, 1e-6)
  const center = new THREE.Vector3()
  bounds.getCenter(center)
  const offsetGroup = new THREE.Group()

  offsetGroup.position.set(-center.x, -center.y, -center.z)
  offsetGroup.add(object)
  wrapper.scale.setScalar(1 / maxDimension)
  wrapper.add(offsetGroup)

  return wrapper
}

function traverseMeshes(
  root: THREE.Object3D,
  visitor: (mesh: THREE.Mesh) => void
): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      visitor(child)
    }
  })
}

function disposeNode(root: THREE.Object3D): void {
  traverseMeshes(root, (mesh) => {
    mesh.geometry.dispose()

    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) {
        material.dispose()
      }
      return
    }

    mesh.material.dispose()
  })
}

function assignCustomMaterial(mesh: THREE.Mesh, materialFactory: () => THREE.Material): void {
  if (Array.isArray(mesh.material)) {
    for (const material of mesh.material) {
      material.dispose()
    }
  } else {
    mesh.material.dispose()
  }

  mesh.material = materialFactory()
}

export class ModelPass extends PassNode {
  private readonly perspScene: THREE.Scene
  private readonly perspCamera: THREE.PerspectiveCamera
  private readonly internalRT: THREE.WebGLRenderTarget
  private readonly blitInputNode: Node
  private readonly keyLight: THREE.DirectionalLight
  private readonly fillLight: THREE.DirectionalLight
  private readonly rimLight: THREE.DirectionalLight
  private readonly hemiLight: THREE.HemisphereLight
  private readonly sceneGroup: THREE.Group
  private readonly modelPositionGroup: THREE.Group
  private readonly modelRotationGroup: THREE.Group

  private sourceAsset: RenderableLayerPass["asset"] = null
  private activeObject: THREE.Object3D | null = null
  private currentHdriPreset = ""
  private hdriLoadingPreset = ""
  private readonly liquidTimeNode: TSLNode = uniform(0.0)
  private width = 1
  private height = 1
  private rebuildRequestId = 0
  private lastSourceSignature = ""
  private lastSvgSignature = ""
  private currentGeometrySource: GeometrySource = "model"
  private currentBackgroundMode: BackgroundMode = "transparent"
  private currentBackgroundColor = new THREE.Color("#0d1117")
  private currentModelParams: LayerParameterValues = {}
  private currentContinuousRender = false
  private currentEnvironmentStrength = 1
  private animationMixer: THREE.AnimationMixer | null = null
  private animationClips: THREE.AnimationClip[] = []
  private lastAnimationStateSignature = ""
  private animatedRoot: THREE.Object3D | null = null
  private animatedRootRestPosition = new THREE.Vector3()

  constructor(layerId: string) {
    super(layerId)

    this.perspScene = new THREE.Scene()
    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    this.perspCamera.position.set(0, 0, 2.4)
    this.perspScene.add(this.perspCamera)

    this.sceneGroup = new THREE.Group()
    this.perspScene.add(this.sceneGroup)
    this.modelPositionGroup = new THREE.Group()
    this.modelRotationGroup = new THREE.Group()
    this.sceneGroup.add(this.modelPositionGroup)
    this.modelPositionGroup.add(this.modelRotationGroup)

    this.hemiLight = new THREE.HemisphereLight("#e9ecff", "#10141e", 0.85)
    this.perspScene.add(this.hemiLight)

    this.keyLight = new THREE.DirectionalLight("#fff3d4", 2.3)
    this.keyLight.position.set(3.5, 4.2, 4.5)
    this.perspScene.add(this.keyLight)

    this.fillLight = new THREE.DirectionalLight("#98b6ff", 1.2)
    this.fillLight.position.set(-3.8, 1.4, 2.4)
    this.perspScene.add(this.fillLight)

    this.rimLight = new THREE.DirectionalLight("#d6e4ff", 1.35)
    this.rimLight.position.set(0.6, -2.8, -4.4)
    this.perspScene.add(this.rimLight)

    this.internalRT = new THREE.WebGLRenderTarget(1, 1, MODEL_RT_OPTIONS)

    const blitUv = vec2(uv().x, float(1).sub(uv().y))
    this.blitInputNode = tslTexture(new THREE.Texture(), blitUv)

    this.rebuildEffectNode()
  }

  setSourceAsset(asset: RenderableLayerPass["asset"]): void {
    this.sourceAsset = asset
    this.requestSourceRebuild()
  }

  override updateParams(params: LayerParameterValues): void {
    this.currentModelParams = params
    this.currentGeometrySource = normalizeGeometrySource(params.geometrySource)
    this.currentBackgroundMode = normalizeBackgroundMode(params.backgroundMode)
    this.currentBackgroundColor.set(
      typeof params.backgroundColor === "string"
        ? params.backgroundColor
        : "#0d1117"
    )
    this.currentContinuousRender =
      params.autoRotate === true ||
      (typeof params.floatAmplitude === "number" && params.floatAmplitude > 0) ||
      normalizeMaterialPreset(params.materialPreset) === "liquid"
    this.currentEnvironmentStrength =
      typeof params.environmentStrength === "number"
        ? clamp(params.environmentStrength, 0, 2)
        : 1

    const nextSvgSignature = [
      this.currentGeometrySource,
      typeof params.svgFileName === "string" ? params.svgFileName : "",
      typeof params.svgSource === "string" ? params.svgSource : "",
      typeof params.svgSourceRevision === "number"
        ? params.svgSourceRevision
        : 0,
      typeof params.badgeThickness === "number" ? params.badgeThickness : 0.18,
    ].join("|")

    if (nextSvgSignature !== this.lastSvgSignature) {
      this.lastSvgSignature = nextSvgSignature
      this.requestSourceRebuild()
    }

    if (this.currentGeometrySource === "model") {
      this.requestSourceRebuild()
    }

    this.applyEnvironmentPreset()
    this.applyMaterialState()
    this.updateSceneTransform(0)
    this.perspCamera.fov =
      typeof params.cameraFov === "number"
        ? clamp(params.cameraFov, 18, 90)
        : 45
    this.perspCamera.updateProjectionMatrix()
    this.syncAnimationPlayback()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.loadHdriIfNeeded(renderer)
    this.liquidTimeNode.value = time * 1000
    this.updateSceneTransform(time)

    if (this.animationMixer && this.shouldAnimateClip()) {
      this.animationMixer.update(Math.max(delta, 0) * this.getAnimationSpeed())

      if (this.animatedRoot) {
        this.animatedRoot.position.copy(this.animatedRootRestPosition)
      }
    }

    renderer.setClearColor(
      this.currentBackgroundMode === "solid"
        ? this.currentBackgroundColor
        : "#000000",
      this.currentBackgroundMode === "solid" ? 1 : 0
    )
    renderer.setRenderTarget(this.internalRT)
    renderer.render(this.perspScene, this.perspCamera)

    this.blitInputNode.value = this.internalRT.texture
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.internalRT.setSize(this.width, this.height)
    this.perspCamera.aspect = this.width / this.height
    this.perspCamera.updateProjectionMatrix()
  }

  override needsContinuousRender(): boolean {
    return this.currentContinuousRender || this.shouldAnimateClip()
  }

  override dispose(): void {
    this.clearActiveObject()
    this.internalRT.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.blitInputNode) {
      return this.inputNode
    }

    return this.blitInputNode
  }

  private requestSourceRebuild(): void {
    const nextSignature = [
      this.currentGeometrySource,
      this.sourceAsset?.id ?? "no-asset",
      this.sourceAsset?.url ?? "no-url",
      this.sourceAsset?.mimeType ?? "no-mime",
      this.sourceAsset?.fileName ?? "no-file",
      normalizeMaterialMode(this.currentModelParams.materialMode),
      typeof this.currentModelParams.badgeThickness === "number"
        ? this.currentModelParams.badgeThickness.toFixed(3)
        : "0.180",
      typeof this.currentModelParams.svgSourceRevision === "number"
        ? this.currentModelParams.svgSourceRevision
        : 0,
      typeof this.currentModelParams.svgFileName === "string"
        ? this.currentModelParams.svgFileName
        : "",
      typeof this.currentModelParams.svgSource === "string"
        ? this.currentModelParams.svgSource.length
        : 0,
    ].join("|")

    if (nextSignature === this.lastSourceSignature) {
      return
    }

    this.lastSourceSignature = nextSignature
    this.rebuildRequestId += 1
    const requestId = this.rebuildRequestId

    if (this.currentGeometrySource === "svg-badge") {
      this.rebuildSvgBadge(requestId)
      return
    }

    this.rebuildModelAsset(requestId)
  }

  private rebuildSvgBadge(requestId: number): void {
    try {
      const geometry = buildSvgBadgeGeometry(
        typeof this.currentModelParams.svgSource === "string"
          ? this.currentModelParams.svgSource
          : "",
        typeof this.currentModelParams.svgFileName === "string"
          ? this.currentModelParams.svgFileName
          : "",
        typeof this.currentModelParams.badgeThickness === "number"
          ? this.currentModelParams.badgeThickness
          : 0.18
      )

      const material = this.buildMaterial()
      const mesh = new THREE.Mesh(geometry.geometry, material)
      mesh.castShadow = false
      mesh.receiveShadow = false

      const group = new THREE.Group()
      group.name = geometry.fileName
      group.add(mesh)
      this.commitActiveObject(requestId, group, [])
    } catch (error) {
      this.commitFailure(
        requestId,
        error instanceof Error
          ? error.message
          : "Could not build the SVG badge."
      )
    }
  }

  private rebuildModelAsset(requestId: number): void {
    const asset = this.sourceAsset

    if (!asset) {
      this.commitActiveObject(requestId, null, [])
      return
    }

    if (
      asset.kind !== "model" ||
      !supportsModelAsset(asset.fileName, asset.mimeType)
    ) {
      this.commitFailure(
        requestId,
        "Model layer v1 supports GLB/GLTF assets only."
      )
      return
    }

    void loader
      .loadAsync(asset.url)
      .then((gltf) => {
        const root = gltf.scene || gltf.scenes[0]

        if (!root) {
          throw new Error("The model file does not contain a renderable scene.")
        }

        const clone = cloneSkeleton(root)
        const normalizedRoot = normalizeObjectToUnitBounds(clone)
        if (this.shouldUseCustomMaterials()) {
          traverseMeshes(normalizedRoot, (mesh) => {
            assignCustomMaterial(mesh, () => this.buildMaterial())
            mesh.castShadow = false
            mesh.receiveShadow = false
          })
        } else {
          traverseMeshes(normalizedRoot, (mesh) => {
            mesh.castShadow = false
            mesh.receiveShadow = false
          })
        }

        this.commitActiveObject(
          requestId,
          normalizedRoot,
          gltf.animations,
          clone
        )
      })
      .catch((error) => {
        this.commitFailure(
          requestId,
          error instanceof Error
            ? error.message
            : "Could not load the 3D model."
        )
      })
  }

  private commitActiveObject(
    requestId: number,
    object: THREE.Object3D | null,
    animationClips: THREE.AnimationClip[],
    animatedRoot: THREE.Object3D | null = null
  ): void {
    if (requestId !== this.rebuildRequestId) {
      if (object) {
        disposeNode(object)
      }
      return
    }

    this.clearActiveObject()

    if (object) {
      this.modelRotationGroup.add(object)
    }

    this.activeObject = object
    this.animatedRoot = animatedRoot
    this.animatedRootRestPosition.copy(
      animatedRoot?.position ?? new THREE.Vector3()
    )
    this.setAnimationClips(animationClips)
    this.applyMaterialState()
    this.updateSceneTransform(0)
    useLayerStore.getState().setLayerRuntimeError(this.layerId, null)
  }

  private commitFailure(requestId: number, message: string): void {
    if (requestId !== this.rebuildRequestId) {
      return
    }

    this.clearActiveObject()
    useLayerStore.getState().setLayerRuntimeError(this.layerId, message)
  }

  private clearActiveObject(): void {
    this.animationMixer?.stopAllAction()
    this.animationMixer = null
    this.animationClips = []
    this.animatedRoot = null
    this.animatedRootRestPosition.set(0, 0, 0)

    if (this.activeObject) {
      this.modelRotationGroup.remove(this.activeObject)
      disposeNode(this.activeObject)
      this.activeObject = null
    }
  }

  private buildMaterialState(): ModelMaterialState {
    const preset = resolveMaterialPreset(
      normalizeMaterialPreset(this.currentModelParams.materialPreset)
    )

    const p = this.currentModelParams
    return {
      brilliance:
        typeof p.brilliance === "number" ? p.brilliance : preset.brilliance,
      color:
        typeof p.materialColor === "string" ? p.materialColor : preset.color,
      envBlur: typeof p.envBlur === "number" ? p.envBlur : 0,
      metalness:
        typeof p.metalness === "number" ? p.metalness : preset.metalness,
      roughness:
        typeof p.roughness === "number" ? p.roughness : preset.roughness,
    }
  }

  private buildLiquidState(): LiquidMaterialState {
    const p = this.currentModelParams
    return {
      liquid: typeof p.liquid === "number" ? p.liquid : 0.07,
      patternBlur: typeof p.patternBlur === "number" ? p.patternBlur : 0.005,
      patternScale: typeof p.patternScale === "number" ? p.patternScale : 2,
      refraction: typeof p.refraction === "number" ? p.refraction : 0.015,
      speed: typeof p.speed === "number" ? p.speed : 0.3,
      timeNode: this.liquidTimeNode,
    }
  }

  private buildMaterial(): THREE.Material {
    const preset = normalizeMaterialPreset(this.currentModelParams.materialPreset)
    return buildCustomModelMaterial(
      preset,
      this.buildMaterialState(),
      preset === "liquid" ? this.buildLiquidState() : undefined
    )
  }

  private applyEnvironmentPreset(): void {
    const preset =
      typeof this.currentModelParams.environment === "string"
        ? this.currentModelParams.environment
        : "studio"
    const strength = this.currentEnvironmentStrength

    // Scale direct lights based on strength — they supplement the HDRI
    switch (preset) {
      case "sunset":
        this.hemiLight.color.set("#ffd6b0")
        this.hemiLight.groundColor.set("#2a1620")
        this.hemiLight.intensity = 0.4 * strength
        this.keyLight.color.set("#ffcf8c")
        this.keyLight.intensity = 1.0 * strength
        this.fillLight.color.set("#ff7ca0")
        this.fillLight.intensity = 0.4 * strength
        this.rimLight.color.set("#89a7ff")
        this.rimLight.intensity = 0.6 * strength
        break
      case "warehouse":
        this.hemiLight.color.set("#f1f4ff")
        this.hemiLight.groundColor.set("#1b222d")
        this.hemiLight.intensity = 0.35 * strength
        this.keyLight.color.set("#f5f7ff")
        this.keyLight.intensity = 0.8 * strength
        this.fillLight.color.set("#cbd5ec")
        this.fillLight.intensity = 0.35 * strength
        this.rimLight.color.set("#d2d8e6")
        this.rimLight.intensity = 0.5 * strength
        break
      case "night":
        this.hemiLight.color.set("#7d8dc8")
        this.hemiLight.groundColor.set("#0b1020")
        this.hemiLight.intensity = 0.25 * strength
        this.keyLight.color.set("#bdd2ff")
        this.keyLight.intensity = 0.7 * strength
        this.fillLight.color.set("#536bdf")
        this.fillLight.intensity = 0.3 * strength
        this.rimLight.color.set("#f4c7ff")
        this.rimLight.intensity = 0.6 * strength
        break
      default:
        this.hemiLight.color.set("#f4f6ff")
        this.hemiLight.groundColor.set("#111826")
        this.hemiLight.intensity = 0.35 * strength
        this.keyLight.color.set("#fff1c7")
        this.keyLight.intensity = 0.9 * strength
        this.fillLight.color.set("#a7c4ff")
        this.fillLight.intensity = 0.4 * strength
        this.rimLight.color.set("#ffffff")
        this.rimLight.intensity = 0.5 * strength
        break
    }

    // Mark that we need to load this HDRI (actual loading happens in render when we have the renderer)
    if (preset !== this.currentHdriPreset) {
      this.currentHdriPreset = preset
    }
  }

  private loadHdriIfNeeded(renderer: THREE.WebGPURenderer): void {
    const preset = this.currentHdriPreset
    if (preset === this.hdriLoadingPreset) return
    this.hdriLoadingPreset = preset

    const fileName = HDRI_PRESET_FILES[preset] ?? HDRI_PRESET_FILES.studio!
    const url = `${HDRI_CDN_BASE}${fileName}`

    // Check cache first
    const cached = hdriCache.get(url)
    if (cached) {
      this.perspScene.environment = cached
      this.perspScene.environmentIntensity = this.currentEnvironmentStrength
      return
    }

    void hdrLoader.loadAsync(url).then((hdrTexture) => {
      const pmremGenerator = new THREE.PMREMGenerator(renderer as unknown as THREE.WebGLRenderer)
      const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture
      hdrTexture.dispose()
      pmremGenerator.dispose()

      hdriCache.set(url, envMap)
      this.perspScene.environment = envMap
      this.perspScene.environmentIntensity = this.currentEnvironmentStrength
    }).catch((err) => {
      console.warn("Failed to load HDRI environment:", err)
    })
  }

  private applyMaterialState(): void {
    if (!this.activeObject || !this.shouldUseCustomMaterials()) {
      return
    }

    traverseMeshes(this.activeObject, (mesh) => {
      assignCustomMaterial(mesh, () => this.buildMaterial())
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          material.needsUpdate = true
        }
      } else {
        mesh.material.needsUpdate = true
      }
    })
  }

  private updateSceneTransform(time: number): void {
    const [positionX, positionY, positionZ] = toVec3(
      this.currentModelParams.position,
      [0, 0, 0]
    )
    const [rotationX, rotationY, rotationZ] = toVec3(
      this.currentModelParams.rotation,
      [0, 0, 0]
    )
    const [orbitX, orbitY, orbitZ] = toVec3(
      this.currentModelParams.cameraOrbit,
      [0, 0, 0]
    )
    const modelScale =
      typeof this.currentModelParams.modelScale === "number"
        ? clamp(this.currentModelParams.modelScale, 0.1, 4)
        : 1
    const floatAmplitude =
      typeof this.currentModelParams.floatAmplitude === "number"
        ? clamp(this.currentModelParams.floatAmplitude, 0, 1)
        : 0
    const floatSpeed =
      typeof this.currentModelParams.floatSpeed === "number"
        ? clamp(this.currentModelParams.floatSpeed, 0, 4)
        : 0.75
    const autoRotateSpeed =
      this.currentModelParams.autoRotate === true &&
      typeof this.currentModelParams.autoRotateSpeed === "number"
        ? this.currentModelParams.autoRotateSpeed
        : 0
    const cameraDistance =
      typeof this.currentModelParams.cameraDistance === "number"
        ? clamp(this.currentModelParams.cameraDistance, 0.2, 6)
        : 1.2

    const animatedYOffset =
      floatAmplitude > 0
        ? Math.sin(time * Math.max(floatSpeed, 0.001)) * floatAmplitude
        : 0
    const animatedRotationY = autoRotateSpeed !== 0 ? time * autoRotateSpeed : 0

    this.modelPositionGroup.position.set(
      positionX,
      positionY + animatedYOffset,
      positionZ
    )
    this.modelRotationGroup.position.set(0, 0, 0)
    this.modelRotationGroup.rotation.set(
      rotationX,
      rotationY + animatedRotationY,
      rotationZ
    )
    this.modelRotationGroup.scale.setScalar(modelScale)

    const yaw = orbitY
    const pitch = orbitX
    const orbitRadius = cameraDistance
    const cosPitch = Math.cos(pitch)
    const focus = new THREE.Vector3(0, 0, 0)

    this.perspCamera.position.set(
      focus.x + orbitRadius * Math.sin(yaw) * cosPitch,
      focus.y + orbitRadius * Math.sin(pitch),
      focus.z + orbitRadius * Math.cos(yaw) * cosPitch + orbitZ * 0.15
    )
    this.perspCamera.lookAt(focus)
  }

  private setAnimationClips(animationClips: THREE.AnimationClip[]): void {
    this.animationClips = [...animationClips]
    this.animationMixer =
      this.activeObject && this.animationClips.length > 0
        ? new THREE.AnimationMixer(this.activeObject)
        : null
    this.syncAnimationParams()
    this.syncAnimationPlayback(true)
  }

  private syncAnimationParams(): void {
    const layerStore = useLayerStore.getState()
    const names = this.animationClips.map((clip) => clip.name || "Clip")
    const serializedNames = JSON.stringify(names)
    const currentNames =
      typeof this.currentModelParams.animationNames === "string"
        ? this.currentModelParams.animationNames
        : "[]"
    const currentActive =
      typeof this.currentModelParams.activeAnimation === "string"
        ? this.currentModelParams.activeAnimation
        : ""
    const nextActive =
      names.length === 0
        ? ""
        : names.includes(currentActive)
          ? currentActive
          : (names[0] ?? "")

    if (currentNames !== serializedNames) {
      layerStore.updateLayerParam(
        this.layerId,
        "animationNames",
        serializedNames
      )
    }

    if (currentActive !== nextActive) {
      layerStore.updateLayerParam(this.layerId, "activeAnimation", nextActive)
    }
  }

  private syncAnimationPlayback(force = false): void {
    if (!this.animationMixer || this.animationClips.length === 0) {
      this.lastAnimationStateSignature = ""
      return
    }

    const clipName =
      typeof this.currentModelParams.activeAnimation === "string"
        ? this.currentModelParams.activeAnimation
        : ""
    const playing = this.currentModelParams.animationPlaying !== false
    const looping = this.currentModelParams.animationLoop !== false
    const speed = this.getAnimationSpeed()
    const signature = [
      clipName,
      playing ? "1" : "0",
      looping ? "1" : "0",
      speed.toFixed(3),
    ].join("|")

    if (!force && signature === this.lastAnimationStateSignature) {
      return
    }

    this.lastAnimationStateSignature = signature
    const clip =
      this.animationClips.find((entry) => entry.name === clipName) ??
      this.animationClips[0] ??
      null

    if (!clip) {
      return
    }

    this.animationMixer.stopAllAction()
    const action = this.animationMixer.clipAction(clip)
    action.clampWhenFinished = !looping
    action.enabled = true
    action.paused = !playing
    action.setLoop(
      looping ? THREE.LoopRepeat : THREE.LoopOnce,
      looping ? Infinity : 1
    )
    action.timeScale = speed
    action.reset().play()
  }

  private shouldAnimateClip(): boolean {
    return (
      this.animationMixer !== null &&
      this.animationClips.length > 0 &&
      this.currentModelParams.animationPlaying !== false
    )
  }

  private getAnimationSpeed(): number {
    return typeof this.currentModelParams.animationSpeed === "number"
      ? clamp(this.currentModelParams.animationSpeed, 0, 4)
      : 1
  }

  private shouldUseCustomMaterials(): boolean {
    if (this.currentGeometrySource === "svg-badge") {
      return true
    }

    return (
      normalizeMaterialMode(this.currentModelParams.materialMode) === "custom"
    )
  }
}
