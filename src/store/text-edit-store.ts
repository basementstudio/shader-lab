import { create } from "zustand"
import type { EditorLayer } from "@/types/editor"

type TextEditState = {
  layerId: string | null
  original: string | null
  edit: (layerId: string | null, original?: string | null) => void
}
export const useTextEditStore = create<TextEditState>((set) => ({
  layerId: null,
  original: null,
  edit: (layerId, original = null) => set({ layerId, original }),
}))

export function canEditTextLayer(
  layers: EditorLayer[],
  id: string | null
): boolean {
  const layer = layers.find((item) => item.id === id)
  if (!layer || layer.type !== "text") return false
  let current: EditorLayer | undefined = layer
  const visited = new Set<string>()
  while (current) {
    if (current.locked || !current.visible || visited.has(current.id))
      return false
    visited.add(current.id)
    current = layers.find((item) => item.id === current?.parentId)
  }
  return true
}

export function findTextLayerToEdit(
  layers: EditorLayer[],
  selectedId: string | null
): string | null {
  if (canEditTextLayer(layers, selectedId)) return selectedId
  const first = layers.find((layer) => canEditTextLayer(layers, layer.id))
  return first?.id ?? null
}
