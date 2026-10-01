import {
  clamp,
  cos,
  dot,
  float,
  Fn,
  If,
  materialColor,
  materialRoughness,
  mix,
  mx_noise_float,
  normalView,
  positionGeometry,
  positionView,
  pow,
  screenUV,
  texture as tslTexture,
  type TSLNode,
  uniform,
  vec2,
  vec3,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { ModelMaterialId } from "@/lib/editor/config/model-options"

export type OverrideMaterialId = Exclude<ModelMaterialId, "original">

export type OverrideSettings = {
  color: string
  metalness: number
  roughness: number
}

const GLASS_REFRACTION = 0.09
const GLASS_FROST = 0.03
const GLASS_DISPERSION = 0.06
const GLASS_TAP_COUNT = 12
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const GLASS_TAPS: readonly [number, number][] = Array.from(
  { length: GLASS_TAP_COUNT },
  (_, index) => {
    const radius = Math.sqrt((index + 0.5) / GLASS_TAP_COUNT)
    const angle = index * GOLDEN_ANGLE
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  }
)

type SourceMaterial = THREE.Material & {
  alphaMap?: THREE.Texture | null
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  normalScale?: THREE.Vector2
}

export class ModelOverrideMaterials {
  readonly streakScale: TSLNode = uniform(1)
  private readonly byKey = new Map<string, THREE.MeshPhysicalNodeMaterial>()

  constructor(
    readonly id: OverrideMaterialId,
    private readonly backdrop: THREE.Texture | null = null
  ) {}

  materialFor(
    source: THREE.Material,
    geometry: THREE.BufferGeometry,
    settings: OverrideSettings
  ): THREE.MeshPhysicalNodeMaterial {
    const hasUv = geometry.hasAttribute("uv")
    const key = `${source.uuid}:${hasUv ? 1 : 0}`
    let material = this.byKey.get(key)
    if (!material) {
      material = this.create(source as SourceMaterial, hasUv)
      this.apply(material, settings)
      this.byKey.set(key, material)
    }
    return material
  }

  update(settings: OverrideSettings): void {
    for (const material of this.byKey.values()) {
      this.apply(material, settings)
    }
  }

  dispose(): void {
    for (const material of this.byKey.values()) {
      material.dispose()
    }
    this.byKey.clear()
  }

  private create(
    source: SourceMaterial,
    hasUv: boolean
  ): THREE.MeshPhysicalNodeMaterial {
    const material = new THREE.MeshPhysicalNodeMaterial()
    material.side = source.side
    material.transparent = source.transparent
    material.opacity = source.opacity
    material.alphaTest = source.alphaTest
    material.alphaToCoverage = source.alphaToCoverage
    material.depthWrite = source.depthWrite
    if (hasUv) {
      if (source.alphaMap) material.alphaMap = source.alphaMap
      if (source.map && (source.transparent || source.alphaTest > 0)) {
        material.opacityNode = tslTexture(source.map).a.mul(float(source.opacity))
      }
    }
    if (source.normalMap && hasUv) {
      material.normalMap = source.normalMap
      if (source.normalScale) material.normalScale.copy(source.normalScale)
    }
    switch (this.id) {
      case "chrome":
        material.metalness = 1
        break
      case "brushed-metal": {
        material.metalness = 1
        const streak = mx_noise_float(
          positionGeometry.mul(this.streakScale).mul(vec3(1.5, 420, 420))
        )
          .mul(0.5)
          .add(0.5)
        material.roughnessNode = materialRoughness.mul(
          float(0.65).add(streak.mul(0.7))
        )
        break
      }
      case "glass":
        this.setupGlass(material)
        break
      case "clay":
        material.metalness = 0
        break
      case "rubber":
        material.metalness = 0
        material.sheen = 0.15
        material.sheenRoughness = 0.8
        material.sheenColor.set("#ffffff")
        break
      case "iridescent": {
        material.metalness = 1
        const facing = clamp(
          dot(normalView, positionView.negate().normalize()),
          float(0),
          float(1)
        )
        const film = mx_noise_float(
          positionGeometry.mul(this.streakScale).mul(1.8)
        )
        const phase = facing.mul(1.35).add(film.mul(0.45))
        const spectrum = vec3(0.5).add(
          cos(
            vec3(phase, phase, phase)
              .add(vec3(0, 0.33, 0.67))
              .mul(Math.PI * 2)
          ).mul(0.5)
        )
        material.colorNode = mix(vec3(1), spectrum, float(0.85)).mul(
          materialColor
        )
        break
      }
    }
    return material
  }

  private setupGlass(material: THREE.MeshPhysicalNodeMaterial): void {
    material.metalness = 0
    material.transmission = 0
    material.ior = 1.5
    material.specularIntensity = 1
    material.clearcoat = 1
    material.clearcoatRoughness = 0.02
    if (!this.backdrop) return
    const facing = clamp(
      dot(normalView, positionView.negate().normalize()),
      float(0),
      float(1)
    )
    const fresnel = pow(float(1).sub(facing), float(3))
    const bend = vec2(normalView.x, normalView.y.negate()).mul(
      GLASS_REFRACTION
    )
    const spread = materialRoughness.mul(GLASS_FROST)
    const backdrop = this.backdrop
    const sample = (shift: number, x: number, y: number) =>
      tslTexture(
        backdrop,
        clamp(
          screenUV.sub(bend.mul(shift)).add(vec2(x, y).mul(spread)),
          vec2(0),
          vec2(1)
        )
      ).level(0)
    const channel = (shift: number, pick: "r" | "g" | "b") =>
      GLASS_TAPS.reduce<TSLNode>(
        (sum, [x, y]) => sum.add(float(sample(shift, x, y)[pick])),
        float(0)
      ).div(GLASS_TAPS.length)
    const refracted = Fn(() => {
      const result = vec3(0).toVar()
      If(spread.greaterThan(0.0005), () => {
        result.assign(
          vec3(
            channel(1 - GLASS_DISPERSION, "r"),
            channel(1, "g"),
            channel(1 + GLASS_DISPERSION, "b")
          )
        )
      }).Else(() => {
        result.assign(
          vec3(
            float(sample(1 - GLASS_DISPERSION, 0, 0).r),
            float(sample(1, 0, 0).g),
            float(sample(1 + GLASS_DISPERSION, 0, 0).b)
          )
        )
      })
      return result
    })()
    material.backdropNode = refracted.mul(materialColor)
    material.backdropAlphaNode = float(1).sub(fresnel.mul(0.85))
  }

  private apply(
    material: THREE.MeshPhysicalNodeMaterial,
    settings: OverrideSettings
  ): void {
    material.color.set(settings.color)
    material.roughness = Math.min(1, Math.max(0, settings.roughness))
    material.metalness = Math.min(1, Math.max(0, settings.metalness))
  }
}
