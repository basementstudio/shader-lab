import { create } from "zustand"
import type { EditorLayer } from "@/types/editor"

type CellPaintState = {
  layerId: string | null
  tool: "reveal" | "erase"
  brushSize: number
  draft: string | null
  edit: (layerId: string | null) => void
  setTool: (tool: "reveal" | "erase") => void
  setBrushSize: (size: number) => void
  setDraft: (draft: string | null) => void
}
export const useCellPaintStore = create<CellPaintState>((set) => ({
  layerId: null,
  tool: "reveal",
  brushSize: 0.15,
  draft: null,
  edit: (layerId) => set({ layerId, draft: null }),
  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setDraft: (draft) => set({ draft }),
}))

export function canPaintCellLayer(
  layers: EditorLayer[],
  id: string | null,
  selectedId: string | null
): boolean {
  const layer = layers.find((item) => item.id === id)
  if (
    !layer ||
    id !== selectedId ||
    layer.type !== "photographic-cells" ||
    layer.params.mode !== "paint"
  )
    return false
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

// Ephemeral editing guide/draft: never enters project files, history or exports.
let cachedLayers: EditorLayer[] | null = null
let cachedState: CellPaintState | null = null
let cachedPreview: EditorLayer[] = []
export function withCellPaintPreview(
  layers: EditorLayer[],
  selectedId: string | null
): EditorLayer[] {
  const state = useCellPaintStore.getState()
  if (!state.layerId) return layers
  if (!canPaintCellLayer(layers, state.layerId, selectedId)) return layers
  if (layers === cachedLayers && state === cachedState) return cachedPreview
  cachedLayers = layers
  cachedState = state
  cachedPreview = layers.map((layer) =>
    layer.id === state.layerId
      ? {
          ...layer,
          params: {
            ...layer.params,
            _paintGuide: true,
            ...(state.draft === null ? {} : { paintMask: state.draft }),
          },
        }
      : layer
  )
  return cachedPreview
}
