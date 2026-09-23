"use client"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import {
  matchSignalRotStyle,
  SIGNAL_ROT_STYLES,
  signalRotStyleParams,
} from "@/lib/editor/config/signal-rot-styles"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const styleOptions = [
  ...SIGNAL_ROT_STYLES.map((style) => ({
    label: style.label,
    value: style.id,
  })),
  { label: "Custom", value: "custom" },
]

export function SignalRotControls({
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
      data-signal-rot-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Damage
      </Typography>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Style
        </Typography>
        <Select
          triggerAriaLabel="Signal rot style"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={matchSignalRotStyle(values)}
          options={styleOptions}
          onValueChange={(value) => {
            const entry = SIGNAL_ROT_STYLES.find((item) => item.id === value)
            if (!entry) return
            for (const [key, next] of Object.entries(
              signalRotStyleParams(entry)
            )) {
              updateLayerParam(layerId, key, next)
            }
          }}
        />
      </div>
      <Typography tone="muted" variant="caption">
        A style sets every control below; editing any of them makes it Custom.
        Group it with a photo to keep the damage on that photo.
      </Typography>
    </section>
  )
}
