import { selectionRoots, subtreeLayers } from "@/lib/editor/layer-groups"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { useLayerStore } from "@/store/layer-store"
import { useAudioStore } from "@/store/audio-store"
import { useTimelineStore } from "@/store/timeline-store"

export function duplicateLayers(layerIds: readonly string[]): string[] {
  const { duplicateLayer, layers } = useLayerStore.getState()
  const { duplicateLayerTracks } = useTimelineStore.getState()
  const duplicatedIds: string[] = []

  for (const layer of selectionRoots(layers, layerIds)) {
    const originals = subtreeLayers(layers, layer.id)

    const duplicatedId = duplicateLayer(layer.id)

    if (!duplicatedId) {
      continue
    }

    const duplicates = subtreeLayers(
      useLayerStore.getState().layers,
      duplicatedId
    )
    originals.forEach((original, i) => {
      duplicateLayerTracks(original.id, duplicates[i]!.id)
    })
    const mapping = new Map(
      originals.map((original, i) => [original.id, duplicates[i]!.id])
    )
    const audio = useAudioStore.getState().getSnapshot()
    const copiedLinks = audio.links.flatMap((link) => {
      const layerId = mapping.get(link.layerId)
      return layerId
        ? [{ ...structuredClone(link), id: crypto.randomUUID(), layerId }]
        : []
    })
    if (copiedLinks.length) {
      useAudioStore
        .getState()
        .restoreSnapshot({ ...audio, links: [...audio.links, ...copiedLinks] })
    }
    duplicatedIds.push(duplicatedId)
  }

  if (duplicatedIds.length > 0) {
    playUISound("action.addLayer")
  }

  return duplicatedIds
}
