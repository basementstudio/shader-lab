import {
  clamp,
  cos,
  dot,
  float,
  materialColor,
  materialRoughness,
  mix,
  mx_noise_float,
  normalView,
  positionLocal,
  positionView,
  texture,
  type TSLNode,
  uniform,
  vec3,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { ModelMaterialId } from "@/lib/editor/config/model-options"

export type OverrideMaterialId = Exclude<ModelMaterialId, "original">

export type OverrideSettings = {
  color: string
  roughness: number
}

type SourceMaterial = THREE.Material & {
  alphaMap?: THREE.Texture | null
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  normalScale?: THREE.Vector2
}

export class ModelOverrideMaterials {
  readonly streakScale: TSLNode = uniform(1)
  private readonly byKey = new Map<string, THREE.MeshPhysicalNodeMaterial>()

  constructor(readonly id: OverrideMaterialId) {}

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
        material.opacityNode = texture(source.map).a.mul(float(source.opacity))
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
          positionLocal.mul(this.streakScale).mul(vec3(1.5, 420, 420))
        )
          .mul(0.5)
          .add(0.5)
        material.roughnessNode = materialRoughness.mul(
          float(0.65).add(streak.mul(0.7))
        )
        break
      }
      case "glass":
        material.metalness = 0
        material.transmission = 1
        material.thickness = 0.45
        material.ior = 1.5
        material.dispersion = 0.25
        material.specularIntensity = 1
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
          positionLocal.mul(this.streakScale).mul(1.8)
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

  private apply(
    material: THREE.MeshPhysicalNodeMaterial,
    settings: OverrideSettings
  ): void {
    material.color.set(settings.color)
    material.roughness = Math.min(1, Math.max(0, settings.roughness))
  }
}
