export const MODEL_LAYER_INTERNAL_VISIBILITY = {
  equals: "__never__",
  key: "__modelLayerInternal",
} as const

export const MODEL_LAYER_SUPPORTED_MODEL_EXTENSIONS = [".glb", ".gltf"] as const

export const MODEL_LAYER_SUPPORTED_MODEL_MIME_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
]) as ReadonlySet<string>
