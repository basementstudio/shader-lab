"use client"
import { GradientRamp, type GradientStop } from "@/components/ui/gradient-ramp"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
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

export function AnnotationsControls({
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
  const preset =
    ANNOTATION_PRESETS.find((entry) => entry.id === values.textPreset) ??
    ANNOTATION_PRESETS[0]!
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-annotations-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Annotations
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Apply preset
        </Typography>
        <Select
          triggerAriaLabel="Apply text preset"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={preset.id}
          options={ANNOTATION_PRESETS.map((entry) => ({
            label: entry.label,
            value: entry.id,
          }))}
          onValueChange={(value) => {
            const next = ANNOTATION_PRESETS.find((entry) => entry.id === value)
            if (!next) return
            updateLayerParam(layerId, "textPreset", next.id)
            updateLayerParam(layerId, "labelList", next.words)
            updateLayerParam(layerId, "metadataText", next.blocks)
          }}
        />
      </div>
      <Typography tone="muted" variant="caption">
        Decorative only. Words and readouts are picked by seed; nothing is
        detected or recognized.
      </Typography>
      {values.colorMode === "palette" && (
        <GradientRamp
          label="Palette (elements pick a stop by seed)"
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
      )}
      {values.placement === "painted" && (
        <>
          <Typography tone="secondary" variant="label">
            Painted placement
          </Typography>
          <PaintBrushControls
            layerId={layerId}
            target="annotations"
            editLabel="Edit Area"
            doneLabel="Done"
            clearLabel="Clear Area"
          />
        </>
      )}
    </section>
  )
}
