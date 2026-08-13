import { useLayerStore } from "@/store/layer-store"

export function setLayerMediaError(
  layerId: string,
  message: string | null
): void {
  const store = useLayerStore.getState()
  const layer = store.layers.find((entry) => entry.id === layerId)

  if (!layer || layer.runtimeError === message) {
    return
  }

  store.setLayerRuntimeError(layerId, message)
}

export function describeMediaLoadFailure(fileName: string | undefined): string {
  return `Couldn't load ${fileName && fileName.length > 0 ? fileName : "media"}`
}
