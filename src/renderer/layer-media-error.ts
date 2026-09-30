import { useLayerStore } from "@/store/layer-store"

export const MISSING_DEPTH_ERROR_PREFIX = "Missing depth map"

export function setLayerMediaError(
  layerId: string,
  message: string | null
): void {
  const store = useLayerStore.getState()
  const layer = store.layers.find((entry) => entry.id === layerId)

  if (!layer || layer.runtimeError === message) {
    return
  }

  if (
    message === null &&
    layer.runtimeError?.startsWith(MISSING_DEPTH_ERROR_PREFIX)
  ) {
    return
  }

  store.setLayerRuntimeError(layerId, message)
}

const MOTIF_LOAD_FAILURE = /^Couldn't load \d+ motifs?$/

export function describeMotifLoadFailure(count: number): string {
  return `Couldn't load ${count} ${count === 1 ? "motif" : "motifs"}`
}

export function clearMotifLoadFailure(layerId: string): void {
  const layer = useLayerStore
    .getState()
    .layers.find((entry) => entry.id === layerId)

  if (layer?.runtimeError && MOTIF_LOAD_FAILURE.test(layer.runtimeError)) {
    setLayerMediaError(layerId, null)
  }
}

export function describeMediaLoadFailure(fileName: string | undefined): string {
  return `Couldn't load ${fileName && fileName.length > 0 ? fileName : "media"}`
}

export function describeModelLoadFailure(
  fileName: string | undefined,
  cause: unknown
): string {
  const name = fileName && fileName.length > 0 ? fileName : "the model"

  if (name.toLowerCase().endsWith(".gltf")) {
    return `Couldn't load ${name}. Use a single .glb, or a .gltf with its buffers and textures embedded.`
  }

  if (cause instanceof Error && cause.message === "The model has no visible geometry.") {
    return `${name} has no visible geometry`
  }

  if (cause instanceof Error && cause.message.startsWith("The SVG has no filled or stroked shapes")) {
    return `${name} has no filled or stroked shapes. Convert text to outlines and import it again.`
  }

  return `Couldn't load ${name}`
}

const CAMERA_DENIED = ["NotAllowedError", "SecurityError"]
const CAMERA_UNAVAILABLE = ["NotFoundError", "OverconstrainedError"]

export function describeCameraFailure(cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ""

  if (CAMERA_DENIED.includes(name)) {
    return "Camera permission denied"
  }

  if (CAMERA_UNAVAILABLE.includes(name)) {
    return "No camera found"
  }

  return "Couldn't start the camera"
}
