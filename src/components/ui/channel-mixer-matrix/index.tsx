"use client"

import { useMemo, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/cn"
import type { SceneConfig } from "@/types/editor"

type ChannelMixer = SceneConfig["channelMixer"]
type OutputChannelId = "red" | "green" | "blue"

type ChannelMixerMatrixProps = {
  className?: string
  onChange: (nextValue: ChannelMixer) => void
  value: ChannelMixer
}

type MixerKey = keyof ChannelMixer

const OUTPUT_CHANNELS: readonly {
  accent: string
  id: OutputChannelId
  keys: readonly [MixerKey, MixerKey, MixerKey]
  label: string
}[] = [
  {
    accent: "#ff5f5f",
    id: "red",
    keys: ["rr", "rg", "rb"],
    label: "R",
  },
  {
    accent: "#61ff88",
    id: "green",
    keys: ["gr", "gg", "gb"],
    label: "G",
  },
  {
    accent: "#66a3ff",
    id: "blue",
    keys: ["br", "bg", "bb"],
    label: "B",
  },
] as const

const SOURCE_LABELS = ["Red", "Green", "Blue"] as const

const DEFAULT_MIXER: ChannelMixer = {
  bb: 1,
  bg: 0,
  br: 0,
  gb: 0,
  gg: 1,
  gr: 0,
  rb: 0,
  rg: 0,
  rr: 1,
}

export function ChannelMixerMatrix({
  className,
  onChange,
  value,
}: ChannelMixerMatrixProps) {
  const [activeChannel, setActiveChannel] = useState<OutputChannelId>("red")

  const selectedChannel = useMemo(
    () =>
      OUTPUT_CHANNELS.find((channel) => channel.id === activeChannel) ??
      OUTPUT_CHANNELS[0]!,
    [activeChannel]
  )

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {OUTPUT_CHANNELS.map((channel) => {
            const isActive = channel.id === selectedChannel.id
            return (
              <button
                aria-pressed={isActive}
                className={cn(
                  "inline-flex h-7  items-center justify-center rounded-full border px-3 text-[11px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
                  isActive
                    ? "border-white/18 bg-white/10 text-[var(--ds-color-text-primary)]"
                    : "border-white/8 bg-white/[0.03] text-[var(--ds-color-text-secondary)] hover:border-white/14 hover:bg-white/[0.06]"
                )}
                key={channel.id}
                onClick={() => setActiveChannel(channel.id)}
                type="button"
              >
                <span
                  className="mr-1.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: channel.accent }}
                />
                {channel.label}
              </button>
            )
          })}
        </div>

        <button
          aria-label="Reset output mix"
          className="text-[11px] leading-none text-[var(--ds-color-text-muted)] underline decoration-white/24 underline-offset-3 transition-[color,text-decoration-color] duration-160 ease-[var(--ease-out-cubic)] hover:text-[var(--ds-color-text-secondary)] hover:decoration-white/40"
          onClick={() => onChange({ ...DEFAULT_MIXER })}
          type="button"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {selectedChannel.keys.map((key, index) => (
          <Slider
            key={key}
            label={SOURCE_LABELS[index]}
            max={200}
            min={-200}
            onValueChange={(nextValue) =>
              onChange({
                ...value,
                [key]: nextValue / 100,
              })
            }
            value={value[key] * 100}
            valueSuffix="%"
          />
        ))}
      </div>
    </div>
  )
}
