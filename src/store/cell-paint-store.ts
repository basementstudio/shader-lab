import { create } from "zustand"
import type { EditorLayer } from "@/types/editor"
import { useLayerStore } from "@/store/layer-store"

export type PaintTarget = "cells" | "mask"

type CellPaintState = {
  layerId: string | null
  target: PaintTarget
  tool: "reveal" | "erase"
  brushSize: number
  draft: string | null
  edit: (layerId: string | null, target?: PaintTarget) => void
  setTool: (tool: "reveal" | "erase") => void
  setBrushSize: (size: number) => void
  setDraft: (draft: string | null) => void
}
export const useCellPaintStore = create<CellPaintState>((set) => ({
  layerId: null,
  target: "cells",
  tool: "reveal",
  brushSize: 0.15,
  draft: null,
  edit: (layerId, target = "cells") => set({ layerId, target, draft: null }),
  setTool: (tool) => set({ tool }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setDraft: (draft) => set({ draft }),
}))

function editableChain(layers: EditorLayer[], layer: EditorLayer): boolean {
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
  return editableChain(layers, layer)
}

export function canPaintMaskLayer(
  layers: EditorLayer[],
  id: string | null,
  selectedId: string | null
): boolean {
  const layer = layers.find((item) => item.id === id)
  if (
    !layer ||
    id !== selectedId ||
    layer.mask?.shape !== "brush" ||
    layer.mask.enabled === false
  )
    return false
  return editableChain(layers, layer)
}

export function canPaintTarget(
  layers: EditorLayer[],
  id: string | null,
  selectedId: string | null,
  target: PaintTarget
): boolean {
  return target === "mask"
    ? canPaintMaskLayer(layers, id, selectedId)
    : canPaintCellLayer(layers, id, selectedId)
}

export function readPaint(
  layer: EditorLayer | undefined,
  target: PaintTarget
): string {
  if (!layer) return ""
  if (target === "mask") return layer.mask?.paint ?? ""
  return typeof layer.params.paintMask === "string" ? layer.params.paintMask : ""
}

export function writePaint(
  layerId: string,
  target: PaintTarget,
  value: string
): void {
  const state = useLayerStore.getState()
  if (target === "mask") state.setLayerMask(layerId, { paint: value })
  else state.updateLayerParam(layerId, "paintMask", value)
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
  if (!canPaintTarget(layers, state.layerId, selectedId, state.target))
    return layers
  if (layers === cachedLayers && state === cachedState) return cachedPreview
  cachedLayers = layers
  cachedState = state
  cachedPreview = layers.map((layer) => {
    if (layer.id !== state.layerId) return layer
    if (state.target === "mask") {
      return state.draft === null || !layer.mask
        ? layer
        : { ...layer, mask: { ...layer.mask, paint: state.draft } }
    }
    return {
      ...layer,
      params: {
        ...layer.params,
        _paintGuide: true,
        ...(state.draft === null ? {} : { paintMask: state.draft }),
      },
    }
  })
  return cachedPreview
}
