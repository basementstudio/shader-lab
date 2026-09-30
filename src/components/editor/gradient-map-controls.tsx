"use client"
import { GradientRamp } from "@/components/ui/gradient-ramp"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { getParameterDefinition } from "@/lib/editor/parameter-schema"
import {
  canonicalGradientMapStops,
  GRADIENT_MAP_PRESETS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"
import {
  renderFieldLabel,
  type TimelineKeyframeControl,
} from "./properties-sidebar-fields"
import { createParamTimelineBinding } from "./properties-sidebar-utils"

const rampDefinition = getParameterDefinition(
  getLayerDefinition("gradient-map").params,
  "stops"
)

export const GRADIENT_MAP_RAMP_BINDING = rampDefinition
  ? createParamTimelineBinding(rampDefinition)
  : null

const presetOptions = [
  ...GRADIENT_MAP_PRESETS.map((preset) => ({
    label: preset.label,
    value: preset.id,
  })),
  { label: "Custom", value: "custom" },
]

export function GradientMapControls({
  layerId,
  values,
  updateLayerParam,
  onInteractionStart,
  onInteractionEnd,
  timelineControl,
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
  timelineControl?: TimelineKeyframeControl | null
}) {
  const stops = parseGradientMapStops(values.stops)
  const canonical = canonicalGradientMapStops(stops)
  const preset =
    GRADIENT_MAP_PRESETS.find(
      (entry) => canonicalGradientMapStops(entry.stops) === canonical
    )?.id ?? "custom"
  const write = (next: typeof stops) =>
    updateLayerParam(layerId, "stops", serializeGradientMapStops(next))
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-gradient-map-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Ramp
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Preset
        </Typography>
        <Select
          triggerAriaLabel="Gradient map preset"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={preset}
          options={presetOptions}
          onValueChange={(value) => {
            const entry = GRADIENT_MAP_PRESETS.find((p) => p.id === value)
            if (entry) write(entry.stops)
          }}
        />
      </div>
      <GradientRamp
        label={renderFieldLabel("Dark to light", timelineControl ?? null)}
        onChange={write}
        onInteractionEnd={onInteractionEnd}
        onInteractionStart={onInteractionStart}
        stops={stops}
      />
      <Typography tone="muted" variant="caption">
        Dark tones take the left colors, light tones the right. Click the bar
        to add a stop, double-click a stop to remove it.
      </Typography>
    </section>
  )
}
