"use client"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  matchFocusBlurStyle,
  FOCUS_BLUR_STYLES,
  focusBlurStyleParams,
} from "@/lib/editor/config/focus-blur-styles"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...FOCUS_BLUR_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function FocusBlurControls({
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
      data-focus-blur-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Blur
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Blur style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={matchFocusBlurStyle(values)}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = FOCUS_BLUR_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              focusBlurStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <Typography tone="muted" variant="caption">
        A style sets every control below except Center and Invert Focus. Depth
        of Field needs a depth map on the Image layer below: use Estimate.
      </Typography>
    </section>
  )
}
