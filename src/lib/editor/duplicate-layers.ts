import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

export function duplicateLayers(layerIds: readonly string[]): string[] {
  const targetIds = new Set(layerIds)
  const { duplicateLayer, layers } = useLayerStore.getState()
  const { duplicateLayerTracks } = useTimelineStore.getState()
  const duplicatedIds: string[] = []

  for (const layer of layers) {
    if (!targetIds.has(layer.id)) {
      continue
    }

    const duplicatedId = duplicateLayer(layer.id)

    if (!duplicatedId) {
      continue
    }

    duplicateLayerTracks(layer.id, duplicatedId)
    duplicatedIds.push(duplicatedId)
  }

  if (duplicatedIds.length > 0) {
    playUISound("action.addLayer")
  }

  return duplicatedIds
}
