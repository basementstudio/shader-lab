"use client"

import { motion } from "motion/react"
import type {
  AnimatedPropertyBinding,
  ParameterDefinition,
  ParameterValue,
  SelectParameterDefinition,
  TextParameterDefinition,
} from "@/types/editor"
import { cn } from "@/lib/cn"
import { ColorPicker } from "@/components/ui/color-picker"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { XYPad } from "@/components/ui/xy-pad"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import {
  hasTrackForBinding,
  toBooleanValue,
  toColorValue,
  toNumberValue,
  toTextValue,
  toVec2Value,
} from "./properties-sidebar-utils"

export type TimelineKeyframeControl = {
  binding: AnimatedPropertyBinding | null
  hasTrack: boolean
  layerId: string
  onKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  reduceMotion: boolean
  timelinePanelOpen: boolean
  value: ParameterValue
}

function RhombusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 14 14">
      <path
        d="M7 1.8L12.2 7L7 12.2L1.8 7L7 1.8Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function TimelineKeyframeButton({
  control,
}: {
  control: TimelineKeyframeControl | null
}) {
  if (!control?.binding) {
    return null
  }

  let animation: { opacity: number; scale?: number }

  if (control.timelinePanelOpen) {
    animation = control.reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }
  } else {
    animation = control.reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.82 }
  }

  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center">
      <motion.span
        animate={animation}
        className="inline-flex shrink-0"
        initial={false}
        transition={
          control.reduceMotion
            ? { duration: 0.12, ease: "easeOut" }
            : { damping: 20, mass: 0.5, stiffness: 420, type: "spring" }
        }
      >
        <IconButton
          aria-hidden={!control.timelinePanelOpen}
          aria-label={`Create keyframe for ${control.binding.label}`}
          className={cn(
            "h-6 w-6 [&_svg]:h-3 [&_svg]:w-3",
            control.hasTrack && "text-[rgb(200_220_255_/_0.92)]"
          )}
          disabled={!control.timelinePanelOpen}
          onClick={() =>
            control.onKeyframe(
              control.binding as AnimatedPropertyBinding,
              control.layerId,
              control.value
            )
          }
          tabIndex={control.timelinePanelOpen ? 0 : -1}
          variant="ghost"
        >
          <RhombusIcon />
        </IconButton>
      </motion.span>
    </span>
  )
}

function renderFieldLabelStack(
  label: string,
  description: string | undefined,
  control: TimelineKeyframeControl | null
) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 0,
      }}
    >
      <Typography className="min-w-0" tone="secondary" variant="label">
        {renderFieldLabel(label, control)}
      </Typography>
      {description ? (
        <Typography tone="muted" variant="caption">
          {description}
        </Typography>
      ) : null}
    </span>
  )
}

function getCustomPaletteFieldLabel(
  definition: ParameterDefinition,
  layerParams: Record<string, ParameterValue> | null
): string {
  if (!layerParams) {
    return definition.label
  }

  const colorCount =
    typeof layerParams.customColorCount === "number"
      ? layerParams.customColorCount
      : 4

  switch (definition.key) {
    case "customColor1":
      return "Shadows"
    case "customColor2":
      return colorCount <= 2 ? "Highlights" : "Midtones"
    case "customColor3":
      return colorCount === 3 ? "Highlights" : "High Mids"
    case "customColor4":
      return "Highlights"
    default:
      return definition.label
  }
}

function shouldRenderCustomPaletteField(
  definition: ParameterDefinition,
  layerParams: Record<string, ParameterValue> | null
): boolean {
  if (!layerParams) {
    return true
  }

  if (
    definition.key === "customBgColor" ||
    definition.key === "customColorCount" ||
    definition.key === "customLuminanceBias" ||
    definition.key === "customColor1" ||
    definition.key === "customColor2"
  ) {
    return layerParams.colorMode === "custom"
  }

  if (definition.key === "customColor3") {
    return (
      layerParams.colorMode === "custom" &&
      typeof layerParams.customColorCount === "number" &&
      layerParams.customColorCount >= 3
    )
  }

  if (definition.key === "customColor4") {
    return (
      layerParams.colorMode === "custom" &&
      typeof layerParams.customColorCount === "number" &&
      layerParams.customColorCount >= 4
    )
  }

  return true
}

export function renderFieldLabel(
  label: string,
  control: TimelineKeyframeControl | null
) {
  return (
    <span className="inline-flex min-w-0 w-full items-center justify-between gap-2">
      <span>{label}</span>
      <TimelineKeyframeButton control={control} />
    </span>
  )
}

export function ParameterField({
  definition,
  layerId,
  onChange,
  onTimelineKeyframe,
  reduceMotion,
  timelineBinding,
  timelinePanelOpen,
  value,
}: {
  definition: ParameterDefinition
  layerId: string
  onChange: (id: string, key: string, value: ParameterValue) => void
  onTimelineKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  reduceMotion: boolean
  timelineBinding: AnimatedPropertyBinding | null
  timelinePanelOpen: boolean
  value: ParameterValue
}) {
  const layerParams = useLayerStore(
    (state) =>
      state.layers.find((layer) => layer.id === layerId)?.params ?? null
  )
  const timelineTracks = useTimelineStore((state) => state.tracks)
  const timelineControl: TimelineKeyframeControl | null = timelineBinding
    ? {
        binding: timelineBinding,
        hasTrack: hasTrackForBinding(timelineTracks, layerId, timelineBinding),
        layerId,
        onKeyframe: onTimelineKeyframe,
        reduceMotion,
        timelinePanelOpen,
        value,
      }
    : null

  if (!shouldRenderCustomPaletteField(definition, layerParams)) {
    return null
  }

  const fieldLabel = getCustomPaletteFieldLabel(definition, layerParams)

  switch (definition.type) {
    case "number":
      return (
        <Slider
          label={renderFieldLabelStack(
            fieldLabel,
            definition.description,
            timelineControl
          )}
          max={definition.max ?? 100}
          min={definition.min ?? 0}
          onValueChange={(nextValue) =>
            onChange(layerId, definition.key, nextValue)
          }
          step={definition.step ?? 0.01}
          value={toNumberValue(value, definition.defaultValue)}
          valueFormatOptions={{
            maximumFractionDigits: 2,
            minimumFractionDigits: 0,
          }}
        />
      )

    case "select":
      return (
        <div
          className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]"
          style={definition.description ? { alignItems: "start" } : undefined}
        >
          {renderFieldLabelStack(
            fieldLabel,
            definition.description,
            timelineControl
          )}
          <Select
            className="w-[132px]"
            onValueChange={(nextValue) => {
              if (nextValue) {
                onChange(layerId, definition.key, nextValue)
              }
            }}
            options={(definition as SelectParameterDefinition).options}
            triggerClassName="w-[132px]"
            value={typeof value === "string" ? value : definition.defaultValue}
          />
        </div>
      )

    case "boolean":
      return (
        <div
          className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_auto]"
          style={definition.description ? { alignItems: "start" } : undefined}
        >
          {renderFieldLabelStack(
            fieldLabel,
            definition.description,
            timelineControl
          )}
          <Toggle
            checked={toBooleanValue(value)}
            className="justify-self-end"
            onCheckedChange={(nextValue) =>
              onChange(layerId, definition.key, nextValue)
            }
          />
        </div>
      )

    case "color":
      return (
        <div
          className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]"
          style={definition.description ? { alignItems: "start" } : undefined}
        >
          {renderFieldLabelStack(
            fieldLabel,
            definition.description,
            timelineControl
          )}
          <ColorPicker
            onValueChange={(nextValue) =>
              onChange(layerId, definition.key, nextValue)
            }
            value={toColorValue(value)}
          />
        </div>
      )

    case "vec2":
      return (
        <XYPad
          label={renderFieldLabel(fieldLabel, timelineControl)}
          max={definition.max ?? 1}
          min={definition.min ?? -1}
          onValueChange={(nextValue) =>
            onChange(layerId, definition.key, nextValue)
          }
          step={definition.step ?? 0.01}
          value={toVec2Value(value)}
        />
      )

    case "text":
      return (
        <label className="flex flex-col gap-2">
          {renderFieldLabelStack(
            fieldLabel,
            definition.description,
            timelineControl
          )}
          <input
            className="min-h-9 appearance-none rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] py-2 font-[var(--ds-font-mono)] text-[12px] leading-4 text-[var(--ds-color-text-primary)] outline-none transition-[border-color,background-color] duration-120 ease-[ease] focus:border-[var(--ds-color-text-secondary)] placeholder:text-[var(--ds-color-text-muted)]"
            maxLength={(definition as TextParameterDefinition).maxLength}
            onChange={(event) =>
              onChange(layerId, definition.key, event.currentTarget.value)
            }
            spellCheck={false}
            type="text"
            value={toTextValue(value, definition.defaultValue)}
          />
        </label>
      )

    default:
      return null
  }
}
