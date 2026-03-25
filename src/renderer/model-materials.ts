import * as THREE from "three/webgpu"
import { float, vec3, type TSLNode } from "three/tsl"

type Node = TSLNode
type MaterialPreset = "metal" | "plastic"

export interface ModelMaterialState {
  brilliance: number
  color: string
  metalness: number
  roughness: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function colorNode(value: string): Node {
  const color = new THREE.Color(value)
  return vec3(color.r, color.g, color.b)
}

// ---------------------------------------------------------------------------
// Metal — clean PBR metal; geometry + HDRI handle all the visual interest
// ---------------------------------------------------------------------------

function buildMetalMaterial(state: ModelMaterialState): THREE.Material {
  const material = new THREE.MeshPhysicalNodeMaterial()

  material.color.set(state.color)
  material.metalness = 1
  material.metalnessNode = float(clamp(state.metalness, 0.85, 1))
  material.roughness = clamp(state.roughness, 0.02, 0.25)
  material.clearcoatNode = float(clamp(0.5 + state.brilliance * 0.3, 0.5, 1))
  material.clearcoatRoughness = 0.02
  material.specularIntensity = 1.2
  material.envMapIntensity = 1.5

  return material
}

// ---------------------------------------------------------------------------
// Plastic — clean glossy dielectric
// ---------------------------------------------------------------------------

function buildPlasticMaterial(state: ModelMaterialState): THREE.Material {
  const material = new THREE.MeshPhysicalNodeMaterial()

  material.color.set(state.color)
  material.colorNode = colorNode(state.color)
  material.metalness = 0
  material.metalnessNode = float(0)
  material.roughness = clamp(state.roughness, 0.05, 0.45)
  material.clearcoatNode = float(
    clamp(0.6 + state.brilliance * 0.35, 0.6, 1)
  )
  material.clearcoatRoughness = clamp(state.roughness * 0.15, 0.01, 0.06)
  material.specularIntensity = 1
  material.envMapIntensity = 1.0

  return material
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildCustomModelMaterial(
  preset: MaterialPreset,
  state: ModelMaterialState
): THREE.Material {
  switch (preset) {
    case "plastic":
      return buildPlasticMaterial(state)
    default:
      return buildMetalMaterial(state)
  }
}
