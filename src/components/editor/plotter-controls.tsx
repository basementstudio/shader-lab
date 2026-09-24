"use client"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  matchPlotterStyle,
  PLOTTER_STYLES,
  plotterStyleParams,
} from "@/lib/editor/config/plotter-styles"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...PLOTTER_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function PlotterControls({
  layerId,
  values,
  updateLayerParam,
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}) {
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-plotter-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Plotter
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Plotter style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={matchPlotterStyle(values)}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = PLOTTER_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              plotterStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <Typography tone="muted" variant="caption">
        A style sets the mode, pen and paper; Pen 2, Pen 3 and Center stay as
        you set them.
      </Typography>
    </section>
  )
}
