"use client"
import { useMemo } from "react"
import { getDocumentSize } from "@/lib/editor/composition"
import { normalizeTextFontWeight, resolveTextFontFamily } from "@/lib/editor/text-fonts"
import {
  offsetFromPivotUnits,
  textFontSize,
  textPivotUnits,
} from "@/lib/editor/text-geometry"
import { measureTextBlock, resolveLineHeight } from "@/renderer/text-layout"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { canEditTextLayer, useTextEditStore } from "@/store/text-edit-store"
import type { EditorLayer, LayerParameterValues, Size } from "@/types/editor"
import { type Geometry, GeometryHandles } from "./geometry-handles"

function selectTextLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((l) => l.id === state.selectedLayerId)
  return layer && canEditTextLayer(state.layers, layer.id) ? layer : null
}

let measureContext: CanvasRenderingContext2D | null = null
function measure(params: LayerParameterValues, logical: Size): [number, number] {
  if (typeof document === "undefined") return [0.5, 0.1]
  measureContext ??= document.createElement("canvas").getContext("2d")
  const shorter = Math.max(1, Math.min(logical.width, logical.height))
  const fontSize = textFontSize(params)
  if (!measureContext) return [fontSize / shorter, fontSize / shorter]
  const family = typeof params.fontFamily === "string" ? params.fontFamily : "sans"
  const weight = normalizeTextFontWeight(
    family,
    typeof params.fontWeight === "number" ? params.fontWeight : 700
  )
  measureContext.font = `${weight} ${fontSize}px ${resolveTextFontFamily(family)}`
  const block = measureTextBlock(
    measureContext,
    typeof params.text === "string" && params.text ? params.text : "basement.studio",
    fontSize,
    typeof params.letterSpacing === "number" ? params.letterSpacing : -0.05,
    resolveLineHeight(params.lineHeight)
  )
  return [Math.max(0.02, block.width / shorter), Math.max(0.02, block.height / shorter)]
}

export function TextHandlesOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const layer = useLayerStore(selectTextLayer)
  const editing = useTextEditStore((s) => s.layerId)
  const sceneConfig = useEditorStore((s) => s.sceneConfig)
  const outputSize = useEditorStore((s) => s.outputSize)
  const canvasSize = useEditorStore((s) => s.canvasSize)
  const logical = useMemo(
    () => getDocumentSize(sceneConfig, outputSize) ?? canvasSize,
    [sceneConfig, outputSize, canvasSize]
  )
  if (!layer || disabled || editing === layer.id) return null
  const id = layer.id
  const geometryOf = (params: LayerParameterValues): Geometry => ({
    center: textPivotUnits(params, logical),
    size: measure(params, logical),
    rotation: typeof params.rotation === "number" ? params.rotation : 0,
  })
  const read = () =>
    geometryOf(
      useLayerStore.getState().layers.find((l) => l.id === id)?.params ?? layer.params
    )
  const write = (updates: Partial<Geometry>) => {
    const store = useLayerStore.getState()
    const params = store.layers.find((l) => l.id === id)?.params ?? layer.params
    if (updates.center)
      store.updateLayerParam(id, "offset", offsetFromPivotUnits(params, logical, updates.center))
    if (updates.rotation !== undefined) store.updateLayerParam(id, "rotation", updates.rotation)
    if (updates.size) {
      const shorter = Math.min(logical.width, logical.height)
      const current = measure(params, logical)
      const ratio = updates.size[1] / Math.max(1e-6, current[1])
      const next = Math.round(Math.min(600, Math.max(8, textFontSize(params) * ratio)))
      if (next !== textFontSize(params) && Number.isFinite(shorter))
        store.updateLayerParam(id, "fontSize", next)
    }
  }
  return (
    <GeometryHandles
      key={id}
      dataPrefix="text"
      label="Text handles"
      geometry={geometryOf(layer.params)}
      outline="none"
      panning={panning}
      read={read}
      write={write}
      restore={(original) => {
        const store = useLayerStore.getState()
        const params = store.layers.find((l) => l.id === id)?.params ?? layer.params
        store.updateLayerParam(id, "offset", offsetFromPivotUnits(params, logical, original.center))
        store.updateLayerParam(id, "rotation", original.rotation)
      }}
    />
  )
}
