"use client"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer, LayerMask } from "@/types/editor"
import {
  type Geometry,
  GeometryHandles,
  isEditableLayerChain,
} from "./geometry-handles"

const GEOMETRIC = ["linear", "radial", "ellipse", "rectangle"]

function selectMaskLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  const mask = layer?.mask
  if (!(layer && mask?.enabled && GEOMETRIC.includes(mask.shape))) return null
  return isEditableLayerChain(state.layers, layer) ? layer : null
}

const geometryOf = (mask: LayerMask): Geometry => ({
  center: mask.center,
  size: mask.size,
  rotation: mask.rotation,
})

export function MaskHandlesOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectMaskLayer)
  if (!layer?.mask || disabled) return null
  const id = layer.id
  const shape = layer.mask.shape
  const read = (): Geometry => {
    const mask = useLayerStore.getState().layers.find((l) => l.id === id)?.mask
    return mask ? geometryOf(mask) : geometryOf(layer.mask!)
  }
  return (
    <GeometryHandles
      key={id}
      dataPrefix="mask"
      label="Mask handles"
      geometry={geometryOf(layer.mask)}
      outline={
        shape === "linear" || shape === "radial" || shape === "rectangle"
          ? shape
          : "ellipse"
      }
      panning={panning}
      read={read}
      write={(updates) => useLayerStore.getState().setLayerMask(id, updates)}
      restore={(original) => useLayerStore.getState().setLayerMask(id, original)}
    />
  )
}
