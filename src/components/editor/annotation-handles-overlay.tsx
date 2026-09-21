"use client"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer, LayerParameterValues } from "@/types/editor"
import {
  type Geometry,
  GeometryHandles,
  isEditableLayerChain,
} from "./geometry-handles"

function selectAnnotationsLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  if (!layer || layer.type !== "annotations" || layer.params.targetEnabled === false)
    return null
  return isEditableLayerChain(state.layers, layer) ? layer : null
}

function geometryOf(params: LayerParameterValues): Geometry {
  const center = Array.isArray(params.center) ? params.center : null
  const target = Array.isArray(params.targetCenter) ? params.targetCenter : center
  const size = typeof params.targetSize === "number" ? params.targetSize : 0.35
  return {
    center: [Number(target?.[0] ?? -0.2), Number(target?.[1] ?? -0.1)],
    size: [size, size],
    rotation: 0,
  }
}

export function AnnotationHandlesOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectAnnotationsLayer)
  if (!layer || disabled) return null
  const id = layer.id
  const read = () =>
    geometryOf(
      useLayerStore.getState().layers.find((l) => l.id === id)?.params ?? layer.params
    )
  const write = (updates: Partial<Geometry>) => {
    const store = useLayerStore.getState()
    if (updates.center) store.updateLayerParam(id, "targetCenter", updates.center)
    if (updates.size)
      store.updateLayerParam(
        id,
        "targetSize",
        Math.round(Math.min(2, Math.max(0.05, Math.max(updates.size[0], updates.size[1]))) * 1000) / 1000
      )
  }
  return (
    <GeometryHandles
      key={id}
      dataPrefix="annotation"
      label="Annotation target handles"
      geometry={geometryOf(layer.params)}
      outline="radial"
      panning={panning}
      read={read}
      write={write}
      restore={(original) => write(original)}
    />
  )
}
