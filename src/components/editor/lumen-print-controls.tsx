"use client"
import { GradientRamp } from "@/components/ui/gradient-ramp"
import { InfoHint } from "@/components/ui/info-hint"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  LUMEN_PRINT_STYLES,
  lumenPrintStyleParams,
  matchLumenPrintStyle,
} from "@/lib/editor/config/lumen-print-styles"
import {
  DEFAULT_LUMEN_PRINT_STOPS,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...LUMEN_PRINT_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function LumenPrintControls({
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
      ? parseGradientMapStops(values.stops, DEFAULT_LUMEN_PRINT_STOPS)
      : DEFAULT_LUMEN_PRINT_STOPS
  const style = matchLumenPrintStyle(values)
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-lumen-print-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Print
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          <span className="inline-flex items-center gap-1.5">
            Style
            <InfoHint>
              {"A style sets every control below; editing any of them makes it Custom."}
            </InfoHint>
          </span>
        </Typography>
        <Select
          triggerAriaLabel="Lumen print style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={style}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = LUMEN_PRINT_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              lumenPrintStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <GradientRamp
        label={
          <span className="inline-flex items-center gap-1.5">
            Shadows to paper
            <InfoHint>
              The right end is the paper: washed-out areas take that color.
            </InfoHint>
          </span>
        }
        onChange={(next) =>
          updateLayerParam(layerId, "stops", serializeGradientMapStops(next))
        }
        onInteractionEnd={onInteractionEnd}
        onInteractionStart={onInteractionStart}
        stops={stops}
      />
    </section>
  )
}
