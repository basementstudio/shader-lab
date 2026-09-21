"use client"
import { GradientRamp } from "@/components/ui/gradient-ramp"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  GRADIENT_MAP_PRESETS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

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
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}) {
  const stops = parseGradientMapStops(values.stops)
  const serialized = serializeGradientMapStops(stops)
  const preset =
    GRADIENT_MAP_PRESETS.find(
      (entry) => serializeGradientMapStops(entry.stops) === serialized
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
      <GradientRamp label="Dark to light" onChange={write} stops={stops} />
      <Typography tone="muted" variant="caption">
        Dark tones take the left colors, light tones the right. Click the bar
        to add a stop, double-click a stop to remove it.
      </Typography>
    </section>
  )
}
