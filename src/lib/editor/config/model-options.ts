export const MODEL_ENVIRONMENTS = [
  { id: "studio", label: "Studio", url: "/environments/studio_small_03_1k.hdr" },
  { id: "softbox", label: "Softbox", url: "/environments/monochrome_studio_02_1k.hdr" },
  { id: "warehouse", label: "Warehouse", url: "/environments/empty_warehouse_01_1k.hdr" },
  { id: "sunset", label: "Sunset", url: "/environments/venice_sunset_1k.hdr" },
  { id: "neon", label: "Neon", url: "/environments/neon_photostudio_1k.hdr" },
] as const

export type ModelEnvironmentId = (typeof MODEL_ENVIRONMENTS)[number]["id"]

export const CUSTOM_MODEL_ENVIRONMENT = "custom"

export const DEFAULT_MODEL_ENVIRONMENT = MODEL_ENVIRONMENTS[0]

export function resolveBundledEnvironmentUrl(value: unknown): string {
  return (
    MODEL_ENVIRONMENTS.find((entry) => entry.id === value) ??
    DEFAULT_MODEL_ENVIRONMENT
  ).url
}

export const MODEL_MATERIALS = [
  { id: "original", label: "Original" },
  { id: "chrome", label: "Chrome", color: "#ffffff", metalness: 1, roughness: 0.04 },
  { id: "brushed-metal", label: "Brushed Metal", color: "#e4e4e4", metalness: 1, roughness: 0.3 },
  { id: "glass", label: "Glass", color: "#ffffff", metalness: 0, roughness: 0.02 },
  { id: "clay", label: "Clay", color: "#d9d1c5", metalness: 0, roughness: 0.88 },
  { id: "rubber", label: "Rubber", color: "#1b1b1b", metalness: 0, roughness: 0.55 },
  { id: "iridescent", label: "Iridescent", color: "#ffffff", metalness: 1, roughness: 0.12 },
] as const

export type ModelMaterialId = (typeof MODEL_MATERIALS)[number]["id"]

export function resolveModelMaterial(value: unknown): ModelMaterialId {
  return (
    MODEL_MATERIALS.find((entry) => entry.id === value)?.id ?? "original"
  )
}

export function modelMaterialDefaults(
  value: unknown
): { color: string; metalness: number; roughness: number } | null {
  const entry = MODEL_MATERIALS.find((item) => item.id === value)
  return entry && "color" in entry
    ? { color: entry.color, metalness: entry.metalness, roughness: entry.roughness }
    : null
}

export const MODEL_PROJECTIONS = [
  { id: "perspective", label: "Perspective" },
  { id: "orthographic", label: "Orthographic" },
  { id: "isometric", label: "Isometric" },
  { id: "dimetric", label: "Dimetric" },
] as const

export type ModelProjectionId = (typeof MODEL_PROJECTIONS)[number]["id"]

export function resolveModelProjection(value: unknown): ModelProjectionId {
  return (
    MODEL_PROJECTIONS.find((entry) => entry.id === value)?.id ?? "perspective"
  )
}

export const MODEL_TONE_MAPPINGS = [
  { id: "neutral", label: "Neutral" },
  { id: "aces", label: "ACES Filmic" },
  { id: "agx", label: "AgX" },
  { id: "none", label: "None" },
] as const

export type ModelToneMappingId = (typeof MODEL_TONE_MAPPINGS)[number]["id"]
