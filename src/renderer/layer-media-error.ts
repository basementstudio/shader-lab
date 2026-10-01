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

export function describeMediaLoadFailure(fileName: string | undefined): string {
  return `Couldn't load ${fileName && fileName.length > 0 ? fileName : "media"}`
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
