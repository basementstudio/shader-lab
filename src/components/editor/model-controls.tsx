"use client"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { InfoHint } from "@/components/ui/info-hint"
import { Typography } from "@/components/ui/typography"
import { ParameterField } from "@/components/editor/properties-sidebar-fields"
import { cn } from "@/lib/cn"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  CUSTOM_MODEL_ENVIRONMENT,
} from "@/lib/editor/config/model-options"
import {
  MODEL_ANIMATION_ALL,
  MODEL_ANIMATION_NONE,
  type ModelClipInfo,
  modelSelectionDuration,
  modelSelectionValue,
} from "@/lib/editor/model-animation"
import {
  MODEL_GIZMO_MODES,
  useModelGizmoStore,
} from "@/store/model-gizmo-store"
import type {
  AnimatedPropertyBinding,
  LayerParameterValues,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"

const EXTRUDE_KEYS = ["extrudeDepth", "extrudeBevel", "extrudeBevelSegments"] as const

function extrudeDefinitions(): ParameterDefinition[] {
  const params = getLayerDefinition("model").params
  return EXTRUDE_KEYS.flatMap((key) => {
    const definition = params.find((entry) => entry.key === key)
    return definition ? [definition] : []
  })
}

const ANIMATION_KEYS = [
  "animationPlaying",
  "animationSpeed",
  "animationRepeat",
  "animationStart",
] as const

function animationDefinitions(): ParameterDefinition[] {
  const params = getLayerDefinition("model").params
  return ANIMATION_KEYS.flatMap((key) => {
    const definition = params.find((entry) => entry.key === key)
    return definition ? [definition] : []
  })
}

function clipDefinition(clips: readonly ModelClipInfo[]): ParameterDefinition {
  return {
    animatable: false,
    defaultValue: "auto",
    key: "animation",
    label: "Clip",
    options: [
      ...(clips.length > 1
        ? [{ label: "All clips", value: MODEL_ANIMATION_ALL }]
        : []),
      ...clips.map((clip) => ({ label: clip.label, value: clip.name })),
      { label: "None", value: MODEL_ANIMATION_NONE },
    ],
    type: "select",
  }
}

function animationCaption(
  values: LayerParameterValues,
  clips: readonly ModelClipInfo[]
): string {
  const selection = modelSelectionValue(values.animation, clips)
  if (selection === MODEL_ANIMATION_NONE) {
    return "Shows the model at rest."
  }
  const length = modelSelectionDuration(values.animation, clips)
  return `${length.toFixed(2)} s long. It plays with the timeline, so exports match the canvas. Start sets the first frame, and the pose it holds while paused.`
}

function ModelAnimationControls({
  clips,
  layerId,
  onChange,
  onInteractionEnd,
  onInteractionStart,
  onTimelineKeyframe,
  reduceMotion,
  timelinePanelOpen,
  values,
}: {
  clips: readonly ModelClipInfo[]
  layerId: string
  onChange: (id: string, key: string, value: ParameterValue) => void
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  onTimelineKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  reduceMotion: boolean
  timelinePanelOpen: boolean
  values: LayerParameterValues
}) {
  const clip = useMemo(() => clipDefinition(clips), [clips])
  const definitions = useMemo(() => animationDefinitions(), [])
  const selection = modelSelectionValue(values.animation, clips)
  const field = (definition: ParameterDefinition, value: ParameterValue) => (
    <ParameterField
      definition={definition}
      key={definition.key}
      layerId={layerId}
      onChange={onChange}
      onInteractionEnd={onInteractionEnd}
      onInteractionStart={onInteractionStart}
      onTimelineKeyframe={onTimelineKeyframe}
      reduceMotion={reduceMotion}
      timelineBinding={null}
      timelinePanelOpen={timelinePanelOpen}
      value={value}
    />
  )

  return (
    <div className="flex flex-col gap-[10px]" data-model-animation="true">
      <Typography tone="secondary" variant="caption">
        Animation
      </Typography>
      {field(clip, selection)}
      {selection === MODEL_ANIMATION_NONE
        ? null
        : definitions.map((definition) =>
            field(definition, values[definition.key] ?? definition.defaultValue)
          )}
      <Typography tone="muted" variant="caption">
        {animationCaption(values, clips)}
      </Typography>
    </div>
  )
}

function environmentCaption(
  values: LayerParameterValues,
  environmentFileName: string | null
): string | null {
  if (values.environment !== CUSTOM_MODEL_ENVIRONMENT) {
    return null
  }
  return environmentFileName
    ? `Lit by ${environmentFileName}.`
    : "Custom is selected but no .hdr is attached, so the Studio lights it."
}

function ModelExtrudeControls({
  layerId,
  onChange,
  onInteractionEnd,
  onInteractionStart,
  onTimelineKeyframe,
  reduceMotion,
  timelinePanelOpen,
  values,
}: {
  layerId: string
  onChange: (id: string, key: string, value: ParameterValue) => void
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  onTimelineKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  reduceMotion: boolean
  timelinePanelOpen: boolean
  values: LayerParameterValues
}) {
  const definitions = useMemo(() => extrudeDefinitions(), [])
  return (
    <div className="flex flex-col gap-[10px]" data-model-extrude="true">
      <Typography tone="secondary" variant="caption">
        Extrude
      </Typography>
      {definitions.map((definition) => (
        <ParameterField
          definition={definition}
          key={definition.key}
          layerId={layerId}
          onChange={onChange}
          onInteractionEnd={onInteractionEnd}
          onInteractionStart={onInteractionStart}
          onTimelineKeyframe={onTimelineKeyframe}
          reduceMotion={reduceMotion}
          timelineBinding={null}
          timelinePanelOpen={timelinePanelOpen}
          value={values[definition.key] ?? definition.defaultValue}
        />
      ))}
      <Typography tone="muted" variant="caption">
        Filled and stroked shapes become solid, in their SVG colors. Text has to be converted to outlines first.
      </Typography>
    </div>
  )
}

export function ModelControls({
  clips,
  environmentFileName,
  layerId,
  onAttachEnvironment,
  onChange,
  onInteractionEnd,
  onInteractionStart,
  onRemoveEnvironment,
  onReplaceModel,
  onTimelineKeyframe,
  reduceMotion,
  svgSource,
  timelinePanelOpen,
  values,
}: {
  clips: readonly ModelClipInfo[]
  environmentFileName: string | null
  layerId: string
  onAttachEnvironment: () => void
  onChange: (id: string, key: string, value: ParameterValue) => void
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  onRemoveEnvironment: () => void
  onReplaceModel: () => void
  onTimelineKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  reduceMotion: boolean
  svgSource: boolean
  timelinePanelOpen: boolean
  values: LayerParameterValues
}) {
  const mode = useModelGizmoStore((state) => state.mode)
  const setMode = useModelGizmoStore((state) => state.setMode)
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-model-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        <span className="inline-flex items-center gap-1.5">
          Model
          <InfoHint focusable>
            Drag the model to turn it freely, or drag a colored ring or arrow
            to use one axis. Shortcuts: G, R, S, then X, Y or Z to lock an
            axis; Alt resets. Middle-drag orbits the camera.
          </InfoHint>
        </span>
      </Typography>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-1 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] p-0.5">
          {MODEL_GIZMO_MODES.map((entry) => (
            <button
              aria-pressed={mode === entry.id}
              className={cn(
                "flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] font-[var(--ds-font-sans)] text-[11px] text-[var(--ds-color-text-secondary)] transition-[background-color,color] duration-150 hover:text-[var(--ds-color-text-primary)]",
                mode === entry.id &&
                  "bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
              )}
              key={entry.id}
              onClick={() => setMode(entry.id)}
              type="button"
            >
              {entry.label}
              <span className="font-[var(--ds-font-mono)] text-[9px] text-[var(--ds-color-text-muted)]">
                {entry.key}
              </span>
            </button>
          ))}
        </div>
      </div>
      {svgSource ? (
        <ModelExtrudeControls
          layerId={layerId}
          onChange={onChange}
          onInteractionEnd={onInteractionEnd}
          onInteractionStart={onInteractionStart}
          onTimelineKeyframe={onTimelineKeyframe}
          reduceMotion={reduceMotion}
          timelinePanelOpen={timelinePanelOpen}
          values={values}
        />
      ) : null}
      {clips.length > 0 ? (
        <ModelAnimationControls
          clips={clips}
          layerId={layerId}
          onChange={onChange}
          onInteractionEnd={onInteractionEnd}
          onInteractionStart={onInteractionStart}
          onTimelineKeyframe={onTimelineKeyframe}
          reduceMotion={reduceMotion}
          timelinePanelOpen={timelinePanelOpen}
          values={values}
        />
      ) : null}
      <div className="flex items-center justify-between gap-[var(--ds-space-3)]">
        <Typography tone="secondary" variant="label">
          Swap
        </Typography>
        <Button
          onClick={onReplaceModel}
          size="compact"
          uiSound="action.relinkAsset"
          variant="secondary"
        >
          Replace
        </Button>
      </div>
      <div className="flex items-center justify-between gap-[var(--ds-space-3)]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Typography tone="secondary" variant="label">
            Environment
          </Typography>
          {environmentCaption(values, environmentFileName) ? (
            <Typography className="truncate" tone="muted" variant="caption">
              {environmentCaption(values, environmentFileName)}
            </Typography>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            onClick={onAttachEnvironment}
            size="compact"
            uiSound="action.relinkAsset"
            variant="secondary"
          >
            {environmentFileName ? "Replace .hdr" : "Attach .hdr"}
          </Button>
          {environmentFileName ? (
            <Button onClick={onRemoveEnvironment} size="compact" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
