"use client"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  matchPhotocopyStyle,
  PHOTOCOPY_STYLES,
  photocopyStyleParams,
} from "@/lib/editor/config/photocopy-styles"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...PHOTOCOPY_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function PhotocopyControls({
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
      data-photocopy-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Copy
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Photocopy style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={matchPhotocopyStyle(values)}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = PHOTOCOPY_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              photocopyStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <Typography tone="muted" variant="caption">
        A style sets the copy damage and colors; Seed and Paper stay as you
        set them.
      </Typography>
    </section>
  )
}
