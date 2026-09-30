"use client"
import { InfoHint } from "@/components/ui/info-hint"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  matchReliefStyle,
  RELIEF_STYLES,
  reliefStyleParams,
} from "@/lib/editor/config/relief-styles"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...RELIEF_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function ReliefControls({
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
      data-relief-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Relief
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          <span className="inline-flex items-center gap-1.5">
            Style
            <InfoHint>
              {"A style sets every control below except Height From; editing any of them makes it Custom."}
            </InfoHint>
          </span>
        </Typography>
        <Select
          triggerAriaLabel="Relief style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={matchReliefStyle(values)}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = RELIEF_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              reliefStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
    </section>
  )
}
