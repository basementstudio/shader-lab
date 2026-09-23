"use client"
import { GradientRamp } from "@/components/ui/gradient-ramp"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  COLOR_HALOS_STYLES,
  colorHalosStyleParams,
  matchColorHalosStyle,
} from "@/lib/editor/config/color-halos-styles"
import {
  DEFAULT_COLOR_HALOS_STOPS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...COLOR_HALOS_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function ColorHalosControls({
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
  const stops =
    typeof values.stops === "string" && values.stops.trim() !== ""
      ? parseGradientMapStops(values.stops)
      : DEFAULT_COLOR_HALOS_STOPS
  const style = matchColorHalosStyle(values)
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-color-halos-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Halo
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Color halos style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={style}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = COLOR_HALOS_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              colorHalosStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <GradientRamp
        label="Outer edge to core"
        onChange={(next) =>
          updateLayerParam(layerId, "stops", serializeGradientMapStops(next))
        }
        onInteractionEnd={onInteractionEnd}
        onInteractionStart={onInteractionStart}
        stops={stops}
      />
      <Typography tone="muted" variant="caption">
        The left end colors the outer edge of the halo, the right end its core.
        A style sets every control below; editing any of them makes it Custom.
      </Typography>
    </section>
  )
}
