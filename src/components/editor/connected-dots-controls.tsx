"use client"
import { GradientRamp } from "@/components/ui/gradient-ramp"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  CONNECTED_DOTS_STYLES,
  connectedDotsStyleParams,
  matchConnectedDotsStyle,
} from "@/lib/editor/config/connected-dots-styles"
import {
  DEFAULT_CONNECTED_DOTS_STOPS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...CONNECTED_DOTS_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function ConnectedDotsControls({
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
      : DEFAULT_CONNECTED_DOTS_STOPS
  const style = matchConnectedDotsStyle(values)
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-connected-dots-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Dots
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Connected dots style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={style}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = CONNECTED_DOTS_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              connectedDotsStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <GradientRamp
        label="Dark to light"
        maxStops={8}
        onChange={(next) =>
          updateLayerParam(layerId, "stops", serializeGradientMapStops(next))
        }
        onInteractionEnd={onInteractionEnd}
        onInteractionStart={onInteractionStart}
        stops={stops}
      />
      <Typography tone="muted" variant="caption">
        With Color on Palette, each tone takes the flat color of its nearest
        stop, dark on the left. A style sets every control except Motion.
      </Typography>
    </section>
  )
}
