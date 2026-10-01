"use client"
import { GradientRamp, type GradientStop } from "@/components/ui/gradient-ramp"
import {
  ANNOTATION_PRESETS,
  parseAnnotationColors,
} from "@/renderer/annotations-layout"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"
import { PaintBrushControls } from "./paint-brush-controls"

function stopsFrom(value: unknown): GradientStop[] {
  const colors = parseAnnotationColors(value, "#d7d2c8")
  if (colors.length < 2) colors.push("#ff5a1f")
  return colors.map((color, index) => ({
    color,
    position: colors.length > 1 ? index / (colors.length - 1) : 0,
  }))
}

export function applyAnnotationPreset(
  layerId: string,
  presetId: ParameterValue,
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
) {
  const next = ANNOTATION_PRESETS.find((entry) => entry.id === presetId)
  if (!next) return
  updateLayerParam(layerId, "textPreset", next.id)
  updateLayerParam(layerId, "labelList", next.words)
  updateLayerParam(layerId, "metadataText", next.blocks)
}

export function AnnotationsPalette({
  layerId,
  values,
  updateLayerParam,
  onInteractionStart,
  onInteractionEnd,
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
}) {
  return (
    <GradientRamp
      label="Palette"
      onChange={(stops) =>
        updateLayerParam(
          layerId,
          "colors",
          JSON.stringify(
            stops.map((stop) => ({ position: stop.position, color: stop.color }))
          )
        )
      }
      onInteractionEnd={onInteractionEnd}
      onInteractionStart={onInteractionStart}
      stops={stopsFrom(values.colors)}
    />
  )
}

export function AnnotationsPaintedPlacement({ layerId }: { layerId: string }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <PaintBrushControls
        layerId={layerId}
        target="annotations"
        editLabel="Edit Area"
        doneLabel="Done"
        clearLabel="Clear Area"
      />
    </div>
  )
}
