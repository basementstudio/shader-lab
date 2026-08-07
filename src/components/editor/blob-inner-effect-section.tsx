"use client"

import { useMemo } from "react"
import {
  INNER_EFFECT_NONE,
  isInnerEffectType,
  parseInnerEffectParams,
  serializeInnerEffectParams,
} from "@/lib/blob-tracking/inner-effects"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import type {
  LayerParameterValues,
  ParameterDefinition,
  ParameterValue,
  SelectParameterDefinition,
} from "@/types/editor"
import { ColorPicker } from "@/components/ui/color-picker"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { XYPad } from "@/components/ui/xy-pad"
import {
  isParamVisible,
  toBooleanValue,
  toColorValue,
  toNumberValue,
  toVec2Value,
} from "./properties-sidebar-utils"

export function BlobInnerEffectSection({
  layerId,
  onInteractionEnd,
  onInteractionStart,
  updateLayerParam,
  values,
}: {
  layerId: string
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  values: LayerParameterValues
}) {
  const innerType = isInnerEffectType(values.innerEffectType)
    ? values.innerEffectType
    : INNER_EFFECT_NONE
  const rawParams =
    typeof values.innerEffectParams === "string" ? values.innerEffectParams : ""

  const innerValues = useMemo(
    () => parseInnerEffectParams(innerType, rawParams),
    [innerType, rawParams]
  )

  if (innerType === INNER_EFFECT_NONE) {
    return null
  }

  const definition = getLayerDefinition(innerType)
  const definitions = definition.params.filter(
    (entry) => entry.type !== "text"
  )

  const handleChange = (key: string, value: ParameterValue) => {
    updateLayerParam(
      layerId,
      "innerEffectParams",
      serializeInnerEffectParams({ ...innerValues, [key]: value })
    )
  }

  return (
    <div className="flex flex-col gap-[10px] border-[var(--ds-border-divider)] border-l pl-3">
      {definitions.map((entry) => {
        if (!isParamVisible(entry, innerValues, [...definition.params])) {
          return null
        }

        return (
          <InnerEffectField
            definition={entry}
            key={entry.key}
            onChange={handleChange}
            onInteractionEnd={onInteractionEnd}
            onInteractionStart={onInteractionStart}
            value={innerValues[entry.key] ?? entry.defaultValue}
          />
        )
      })}
    </div>
  )
}

function InnerEffectField({
  definition,
  onChange,
  onInteractionEnd,
  onInteractionStart,
  value,
}: {
  definition: ParameterDefinition
  onChange: (key: string, value: ParameterValue) => void
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  value: ParameterValue
}) {
  switch (definition.type) {
    case "number":
      return (
        <Slider
          label={definition.label}
          max={definition.max ?? 100}
          min={definition.min ?? 0}
          onInteractionStart={onInteractionStart}
          onValueChange={(nextValue) => onChange(definition.key, nextValue)}
          onValueCommitted={() => onInteractionEnd?.()}
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
        <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
          <Typography className="min-w-0" tone="secondary" variant="label">
            {definition.label}
          </Typography>
          <Select
            className="w-[132px]"
            onValueChange={(nextValue) => {
              if (nextValue) {
                onChange(definition.key, nextValue)
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
        <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_auto]">
          <Typography className="min-w-0" tone="secondary" variant="label">
            {definition.label}
          </Typography>
          <Toggle
            checked={toBooleanValue(value)}
            className="justify-self-end"
            onCheckedChange={(nextValue) => onChange(definition.key, nextValue)}
          />
        </div>
      )

    case "color":
      return (
        <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
          <Typography className="min-w-0" tone="secondary" variant="label">
            {definition.label}
          </Typography>
          <ColorPicker
            onInteractionEnd={onInteractionEnd}
            onInteractionStart={onInteractionStart}
            onValueChange={(nextValue) => onChange(definition.key, nextValue)}
            value={toColorValue(value)}
          />
        </div>
      )

    case "vec2":
      return (
        <XYPad
          label={definition.label}
          max={definition.max ?? 1}
          min={definition.min ?? -1}
          onInteractionEnd={onInteractionEnd}
          onInteractionStart={onInteractionStart}
          onValueChange={(nextValue) => onChange(definition.key, nextValue)}
          step={definition.step ?? 0.01}
          value={toVec2Value(value)}
        />
      )

    default:
      return null
  }
}
