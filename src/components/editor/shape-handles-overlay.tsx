"use client"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer, LayerParameterValues } from "@/types/editor"
import {
  type Geometry,
  GeometryHandles,
  isEditableLayerChain,
} from "./geometry-handles"

function selectShapeLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  if (!layer || layer.type !== "shape") return null
  return isEditableLayerChain(state.layers, layer) ? layer : null
}

function pair(value: unknown, fallback: [number, number]): [number, number] {
  return Array.isArray(value) &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : fallback
}

function outlineFor(shape: unknown): "rectangle" | "ellipse" | "none" {
  if (shape === "rectangle") return "rectangle"
  if (shape === "ellipse" || shape === "ring") return "ellipse"
  return "none"
}

export function shapeGeometry(params: LayerParameterValues): Geometry {
  return {
    center: pair(params.center, [0, 0]),
    size: pair(params.size, [0.6, 0.6]),
    rotation: typeof params.rotation === "number" ? params.rotation : 0,
  }
}

export function ShapeHandlesOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectShapeLayer)
  if (!layer || disabled) return null
  const id = layer.id
  const read = (): Geometry =>
    shapeGeometry(
      useLayerStore.getState().layers.find((l) => l.id === id)?.params ??
        layer.params
    )
  const write = (updates: Partial<Geometry>) => {
    const store = useLayerStore.getState()
    if (updates.center) store.updateLayerParam(id, "center", updates.center)
    if (updates.size) store.updateLayerParam(id, "size", updates.size)
    if (updates.rotation !== undefined)
      store.updateLayerParam(id, "rotation", updates.rotation)
  }
  const shape = layer.params.shape
  return (
    <GeometryHandles
      key={id}
      dataPrefix="shape"
      label="Shape handles"
      geometry={shapeGeometry(layer.params)}
      outline={outlineFor(shape)}
      panning={panning}
      read={read}
      write={write}
      restore={(original) => write(original)}
    />
  )
}
