"use client"

import { TextAlignRightIcon } from "@radix-ui/react-icons"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  CUSTOM_EFFECT_STARTER,
  CUSTOM_SHADER_ENTRY_EXPORT,
  CUSTOM_SHADER_STARTER,
} from "@/lib/editor/custom-shader/shared"
import { formatCustomShaderSource } from "@/renderer/custom-shader-runtime"
import { useTimelineStore } from "@/store/timeline-store"
import type {
  AnimatedPropertyBinding,
  BlendMode,
  LayerCompositeMode,
  LayerType,
  MaskConfig,
  MaskMode,
  MaskSource,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
import {
  ParameterField,
  renderFieldLabel,
  type TimelineKeyframeControl,
} from "./properties-sidebar-fields"
import {
  blendModeOptions,
  compositeModeOptions,
  createParamTimelineBinding,
  DEFAULT_PARAM_GROUP,
  formatLayerKind,
  groupVisibleParams,
  hasTrackForBinding,
  maskModeOptions,
  maskSourceOptions,
} from "./properties-sidebar-utils"

export function EmptyPropertiesContent() {
  return (
    <div className="flex flex-col gap-1.5 p-4">
      <Typography tone="secondary" variant="overline">
        Properties
      </Typography>
      <Typography variant="body">Select a layer to edit it.</Typography>
      <Typography tone="muted" variant="caption">
        Nothing to edit yet. Create a new layer in the left panel.
      </Typography>
    </div>
  )
}

function CustomShaderSection({
  layerId,
  updateLayerParam,
  values,
}: {
  layerId: string
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  values: Record<string, ParameterValue>
}) {
  const effectMode = values.effectMode === true
  const persistedSource =
    typeof values.sourceCode === "string" ? values.sourceCode : ""
  const persistedEntryExport =
    typeof values.entryExport === "string" && values.entryExport.trim()
      ? values.entryExport
      : CUSTOM_SHADER_ENTRY_EXPORT
  const persistedRevision =
    typeof values.sourceRevision === "number" ? values.sourceRevision : 0
  const [draftSource, setDraftSource] = useState(persistedSource)
  const [draftEntryExport, setDraftEntryExport] = useState(persistedEntryExport)
  const [formatError, setFormatError] = useState<string | null>(null)

  useEffect(() => {
    setDraftSource(persistedSource)
  }, [persistedSource])

  useEffect(() => {
    setDraftEntryExport(persistedEntryExport)
  }, [persistedEntryExport])

  const isDirty =
    draftSource !== persistedSource || draftEntryExport !== persistedEntryExport

  const commitShader = useCallback(
    (next: { entryExport?: string; sourceCode?: string } = {}) => {
      const nextEntryExport =
        (next.entryExport ?? draftEntryExport).trim() ||
        CUSTOM_SHADER_ENTRY_EXPORT
      const nextSourceCode = next.sourceCode ?? draftSource

      updateLayerParam(layerId, "sourceMode", "paste")
      updateLayerParam(layerId, "entryExport", nextEntryExport)
      updateLayerParam(layerId, "sourceFileName", "")
      updateLayerParam(layerId, "sourceCode", nextSourceCode)
      updateLayerParam(layerId, "sourceRevision", persistedRevision + 1)
    },
    [
      draftEntryExport,
      draftSource,
      layerId,
      persistedRevision,
      updateLayerParam,
    ]
  )

  const handleToggleEffectMode = useCallback(
    (next: boolean) => {
      updateLayerParam(layerId, "effectMode", next)

      const trimmed = persistedSource.trim()
      const isDefaultSource =
        !trimmed ||
        trimmed === CUSTOM_SHADER_STARTER.trim() ||
        trimmed === CUSTOM_EFFECT_STARTER.trim()
      if (isDefaultSource) {
        const starter = next ? CUSTOM_EFFECT_STARTER : CUSTOM_SHADER_STARTER
        setDraftSource(starter)
        updateLayerParam(layerId, "sourceCode", starter)
        updateLayerParam(layerId, "sourceRevision", persistedRevision + 1)
      }
    },
    [layerId, persistedRevision, persistedSource, updateLayerParam]
  )

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
      <Typography className="uppercase" tone="secondary" variant="overline">
        Shader
      </Typography>

      <div className="flex flex-col gap-[10px]">
        <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
          <Typography className="min-w-0" tone="secondary" variant="label">
            Effect Mode
          </Typography>
          <Toggle
            checked={effectMode}
            className="justify-self-end"
            onCheckedChange={handleToggleEffectMode}
          />
        </div>

        <label className="flex flex-col gap-2">
          <Typography className="min-w-0" tone="secondary" variant="label">
            Entry Export
          </Typography>
          <input
            className="min-h-9 appearance-none rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[10px] py-2 font-[var(--ds-font-mono)] text-[12px] leading-4 text-[var(--ds-color-text-primary)] outline-none transition-[border-color,background-color] duration-120 ease-[ease] focus:border-[var(--ds-color-text-secondary)] placeholder:text-[var(--ds-color-text-muted)]"
            onChange={(event) => {
              setDraftEntryExport(event.currentTarget.value)
              setFormatError(null)
            }}
            spellCheck={false}
            type="text"
            value={draftEntryExport}
          />
        </label>

        <label className="flex flex-col gap-2">
          <Typography className="min-w-0" tone="secondary" variant="label">
            Sketch Source
          </Typography>
          <textarea
            className="min-h-[280px] w-full resize-y appearance-none rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-3 py-[10px] font-[var(--ds-font-mono)] text-[12px] leading-[18px] text-[var(--ds-color-text-primary)] outline-none transition-[border-color,background-color] duration-120 ease-[ease] focus:border-[var(--ds-color-text-secondary)]"
            onChange={(event) => {
              setDraftSource(event.currentTarget.value)
              setFormatError(null)
            }}
            spellCheck={false}
            value={draftSource}
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <Button
              disabled={!isDirty}
              onClick={() => commitShader()}
              size="compact"
              variant="primary"
            >
              Apply
            </Button>
          </div>

          <IconButton
            aria-label="Format sketch source"
            className="shrink-0"
            onClick={() => {
              void formatCustomShaderSource({
                fileName: "custom-shader.ts",
                sourceCode: draftSource,
              })
                .then((formatted) => {
                  setDraftSource(formatted)
                  setFormatError(null)
                })
                .catch((error) => {
                  setFormatError(
                    error instanceof Error
                      ? error.message
                      : "Could not format sketch source."
                  )
                })
            }}
            title="Format sketch source"
            variant="ghost"
          >
            <TextAlignRightIcon height={14} width={14} />
          </IconButton>
        </div>

        <Typography tone="muted" variant="caption">
          {`⌘V export const sketch = Fn(() => { ...`}
        </Typography>
        {formatError ? (
          <Typography tone="muted" variant="caption">
            {formatError}
          </Typography>
        ) : null}
      </div>
    </section>
  )
}

export function SelectedLayerPropertiesContent({
  blendMode,
  compositeMode,
  maskConfig,
  setLayerMaskConfig,
  definitionName,
  expandedParamGroups,
  hue,
  onInteractionEnd,
  onInteractionStart,
  layerId,
  layerKind,
  layerName,
  layerRuntimeError,
  layerSubtitle,
  layerType,
  onToggleParamGroup,
  onTimelineKeyframe,
  opacity,
  reduceMotion,
  saturation,
  setLayerBlendMode,
  setLayerCompositeMode,
  setLayerHue,
  setLayerOpacity,
  setLayerSaturation,
  timelinePanelOpen,
  updateLayerParam,
  values,
  visibleParams,
}: {
  blendMode: BlendMode
  compositeMode: LayerCompositeMode
  maskConfig: MaskConfig
  setLayerMaskConfig: (id: string, updates: Partial<MaskConfig>) => void
  definitionName: string
  expandedParamGroups: Record<string, boolean>
  hue: number
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  layerId: string
  layerKind: string
  layerName: string
  layerRuntimeError: string | null
  layerSubtitle: string
  layerType: LayerType
  onToggleParamGroup: (groupId: string) => void
  onTimelineKeyframe: (
    binding: AnimatedPropertyBinding,
    layerId: string,
    value: ParameterValue
  ) => void
  opacity: number
  reduceMotion: boolean
  saturation: number
  setLayerBlendMode: (id: string, value: BlendMode) => void
  setLayerCompositeMode: (id: string, value: LayerCompositeMode) => void
  setLayerHue: (id: string, value: number) => void
  setLayerOpacity: (id: string, value: number) => void
  setLayerSaturation: (id: string, value: number) => void
  timelinePanelOpen: boolean
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  values: Record<string, ParameterValue>
  visibleParams: ParameterDefinition[]
}) {
  const groupedParams = useMemo(
    () => groupVisibleParams(visibleParams),
    [visibleParams]
  )
  const showGroupedParams =
    groupedParams.length > 1 || groupedParams[0]?.label !== DEFAULT_PARAM_GROUP

  const opacityBinding = useMemo(
    () => ({
      kind: "layer" as const,
      label: "Opacity",
      property: "opacity" as const,
      valueType: "number" as const,
    }),
    []
  )
  const hueBinding = useMemo(
    () => ({
      kind: "layer" as const,
      label: "Hue",
      property: "hue" as const,
      valueType: "number" as const,
    }),
    []
  )
  const saturationBinding = useMemo(
    () => ({
      kind: "layer" as const,
      label: "Saturation",
      property: "saturation" as const,
      valueType: "number" as const,
    }),
    []
  )
  const timelineTracks = useTimelineStore((state) => state.tracks)

  const hasTrack = useCallback(
    (binding: AnimatedPropertyBinding) =>
      hasTrackForBinding(timelineTracks, layerId, binding),
    [layerId, timelineTracks]
  )

  const buildTimelineControl = useCallback(
    (
      binding: AnimatedPropertyBinding | null,
      value: ParameterValue
    ): TimelineKeyframeControl | null => {
      if (!binding) {
        return null
      }

      return {
        binding,
        hasTrack: hasTrack(binding),
        layerId,
        onKeyframe: onTimelineKeyframe,
        reduceMotion,
        timelinePanelOpen,
        value,
      }
    },
    [hasTrack, layerId, onTimelineKeyframe, reduceMotion, timelinePanelOpen]
  )

  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
        <div className="flex items-center justify-between gap-2">
          <Typography tone="secondary" variant="overline">
            Properties
          </Typography>
          <span className="inline-flex min-h-5 items-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-active)] px-[7px] font-[var(--ds-font-mono)] text-[10px] leading-3 text-[var(--ds-color-text-secondary)] capitalize">
            {formatLayerKind(layerKind)}
          </span>
        </div>
        <Typography variant="title">{layerName}</Typography>
        {layerSubtitle ? (
          <Typography tone="muted" variant="monoXs">
            {layerSubtitle}
          </Typography>
        ) : null}
        {layerRuntimeError ? (
          <Typography tone="muted" variant="caption">
            {layerRuntimeError}
          </Typography>
        ) : null}
      </div>

      <div className="flex min-h-0 max-h-[min(62vh,620px)] flex-col gap-0 overflow-x-hidden overflow-y-auto">
        <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
          <Typography className="uppercase" tone="secondary" variant="overline">
            General
          </Typography>

          <div className="flex flex-col gap-[10px]">
            <Slider
              label={renderFieldLabel(
                "Opacity",
                buildTimelineControl(opacityBinding, opacity)
              )}
              max={100}
              min={0}
              onInteractionStart={onInteractionStart}
              onValueChange={(value) => setLayerOpacity(layerId, value / 100)}
              onValueCommitted={() => onInteractionEnd?.()}
              value={opacity * 100}
              valueSuffix="%"
            />

            <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
              <Typography className="min-w-0" tone="secondary" variant="label">
                Blend
              </Typography>
              <Select
                className="w-[132px]"
                onValueChange={(value) => {
                  if (value) {
                    setLayerBlendMode(layerId, value as BlendMode)
                  }
                }}
                options={blendModeOptions}
                triggerClassName="w-[132px]"
                value={blendMode}
              />
            </div>

            <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
              <Typography className="min-w-0" tone="secondary" variant="label">
                Mode
              </Typography>
              <Select
                className="w-[132px]"
                onValueChange={(value) => {
                  if (value) {
                    setLayerCompositeMode(layerId, value as LayerCompositeMode)
                  }
                }}
                options={compositeModeOptions}
                triggerClassName="w-[132px]"
                value={compositeMode}
              />
            </div>

            {compositeMode === "mask" && (
              <>
                <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
                  <Typography
                    className="min-w-0"
                    tone="secondary"
                    variant="label"
                  >
                    Source
                  </Typography>
                  <Select
                    className="w-[132px]"
                    onValueChange={(value) => {
                      if (value) {
                        setLayerMaskConfig(layerId, {
                          source: value as MaskSource,
                        })
                      }
                    }}
                    options={maskSourceOptions}
                    triggerClassName="w-[132px]"
                    value={maskConfig.source}
                  />
                </div>

                <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
                  <Typography
                    className="min-w-0"
                    tone="secondary"
                    variant="label"
                  >
                    Mask Mode
                  </Typography>
                  <Select
                    className="w-[132px]"
                    onValueChange={(value) => {
                      if (value) {
                        setLayerMaskConfig(layerId, { mode: value as MaskMode })
                      }
                    }}
                    options={maskModeOptions}
                    triggerClassName="w-[132px]"
                    value={maskConfig.mode}
                  />
                </div>

                <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
                  <Typography
                    className="min-w-0"
                    tone="secondary"
                    variant="label"
                  >
                    Invert
                  </Typography>
                  <Toggle
                    checked={maskConfig.invert}
                    className="justify-self-end"
                    onCheckedChange={(nextValue) =>
                      setLayerMaskConfig(layerId, { invert: nextValue })
                    }
                  />
                </div>
              </>
            )}

            <Slider
              label={renderFieldLabel(
                "Hue",
                buildTimelineControl(hueBinding, hue)
              )}
              max={180}
              min={-180}
              onInteractionStart={onInteractionStart}
              onValueChange={(value) => setLayerHue(layerId, value)}
              onValueCommitted={() => onInteractionEnd?.()}
              value={hue}
            />

            <Slider
              label={renderFieldLabel(
                "Saturation",
                buildTimelineControl(saturationBinding, saturation)
              )}
              max={2}
              min={0}
              onInteractionStart={onInteractionStart}
              onValueChange={(value) => setLayerSaturation(layerId, value)}
              onValueCommitted={() => onInteractionEnd?.()}
              step={0.01}
              value={saturation}
              valueFormatOptions={{
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              }}
            />
          </div>
        </section>

        {layerType === "custom-shader" ? (
          <CustomShaderSection
            layerId={layerId}
            updateLayerParam={updateLayerParam}
            values={values}
          />
        ) : null}

        {visibleParams.length > 0 ? (
          <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
            {!showGroupedParams && (
              <Typography
                className="uppercase"
                tone="secondary"
                variant="overline"
              >
                {definitionName}
              </Typography>
            )}

            {showGroupedParams ? (
              <div className="flex flex-col gap-3">
                {groupedParams.map((group) => {
                  const groupKey = `${layerId}:${group.id}`
                  const isExpanded = expandedParamGroups[groupKey] ?? true

                  return (
                    <div className="flex flex-col gap-[10px]" key={group.id}>
                      {group.collapsible ? (
                        <button
                          aria-expanded={isExpanded}
                          className="inline-flex min-h-0 cursor-pointer items-center bg-transparent p-0 text-left text-inherit transition-[background-color,color,transform] duration-120 ease-[ease] hover:text-[var(--ds-color-text-primary)] active:scale-[0.99]"
                          onClick={() => onToggleParamGroup(groupKey)}
                          type="button"
                        >
                          <div className="inline-flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "inline-block h-[7px] w-[7px] shrink-0 border-r-[1.5px] border-b-[1.5px] border-[var(--ds-color-text-secondary)] transition-transform duration-180 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                                isExpanded
                                  ? "translate-x-[-1px] translate-y-[-1px] rotate-[-135deg]"
                                  : "translate-y-[-1px] rotate-45"
                              )}
                            />
                            <Typography tone="secondary" variant="overline">
                              {group.label}
                            </Typography>
                          </div>
                        </button>
                      ) : (
                        <div className="inline-flex min-w-0 items-center gap-2 px-[2px]">
                          <Typography tone="secondary" variant="overline">
                            {group.label}
                          </Typography>
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isExpanded ? (
                          <motion.div
                            animate={
                              reduceMotion
                                ? { opacity: 1 }
                                : { height: "auto", opacity: 1 }
                            }
                            exit={
                              reduceMotion
                                ? { opacity: 0 }
                                : { height: 0, opacity: 0 }
                            }
                            initial={
                              reduceMotion
                                ? { opacity: 0 }
                                : { height: 0, opacity: 0 }
                            }
                            transition={
                              reduceMotion
                                ? { duration: 0.12, ease: "easeOut" }
                                : {
                                    damping: 34,
                                    mass: 0.85,
                                    stiffness: 360,
                                    type: "spring",
                                  }
                            }
                          >
                            <div className="flex flex-col gap-[10px]">
                              {group.params.map((param) => (
                                <ParameterField
                                  definition={param}
                                  key={param.key}
                                  layerId={layerId}
                                  onInteractionEnd={onInteractionEnd}
                                  onInteractionStart={onInteractionStart}
                                  onChange={updateLayerParam}
                                  onTimelineKeyframe={onTimelineKeyframe}
                                  reduceMotion={reduceMotion}
                                  timelineBinding={createParamTimelineBinding(
                                    param
                                  )}
                                  timelinePanelOpen={timelinePanelOpen}
                                  value={
                                    values[param.key] ?? param.defaultValue
                                  }
                                />
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {visibleParams.map((param) => (
                  <ParameterField
                    definition={param}
                    key={param.key}
                    layerId={layerId}
                    onInteractionEnd={onInteractionEnd}
                    onInteractionStart={onInteractionStart}
                    onChange={updateLayerParam}
                    onTimelineKeyframe={onTimelineKeyframe}
                    reduceMotion={reduceMotion}
                    timelineBinding={createParamTimelineBinding(param)}
                    timelinePanelOpen={timelinePanelOpen}
                    value={values[param.key] ?? param.defaultValue}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </>
  )
}
