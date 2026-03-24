"use client"

import { TextAlignRightIcon } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CUSTOM_SHADER_ENTRY_EXPORT } from "@/lib/editor/custom-shader/shared"
import { formatCustomShaderSource } from "@/renderer/custom-shader-runtime"
import type {
  AnimatedPropertyBinding,
  BlendMode,
  LayerCompositeMode,
  LayerType,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Typography } from "@/components/ui/typography"
import { useTimelineStore } from "@/store/timeline-store"
import s from "./properties-sidebar.module.css"
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
} from "./properties-sidebar-utils"

export function EmptyPropertiesContent() {
  return (
    <div className={s.emptyState}>
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

  return (
    <section className={s.section}>
      <Typography
        className={s.sectionTitle}
        tone="secondary"
        variant="overline"
      >
        Shader
      </Typography>

      <div className={s.fieldStack}>
        <label className={s.textField}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            Entry Export
          </Typography>
          <input
            className={s.textInput}
            onChange={(event) => {
              setDraftEntryExport(event.currentTarget.value)
              setFormatError(null)
            }}
            spellCheck={false}
            type="text"
            value={draftEntryExport}
          />
        </label>

        <label className={s.textField}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            Sketch Source
          </Typography>
          <textarea
            className={s.shaderTextarea}
            onChange={(event) => {
              setDraftSource(event.currentTarget.value)
              setFormatError(null)
            }}
            spellCheck={false}
            value={draftSource}
          />
        </label>

        <div className={s.shaderToolbar}>
          <div className={s.shaderToolbarActions}>
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
            className={s.shaderFormatButton}
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
            <TextAlignRightIcon size={14} weight="regular" />
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
  definitionName,
  expandedParamGroups,
  hue,
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
  definitionName: string
  expandedParamGroups: Record<string, boolean>
  hue: number
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
      <div className={s.header}>
        <div className={s.kindRow}>
          <Typography tone="secondary" variant="overline">
            Properties
          </Typography>
          <span className={s.kindBadge}>{formatLayerKind(layerKind)}</span>
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

      <div className={s.content}>
        <section className={s.section}>
          <Typography
            className={s.sectionTitle}
            tone="secondary"
            variant="overline"
          >
            General
          </Typography>

          <div className={s.fieldStack}>
            <Slider
              label={renderFieldLabel(
                "Opacity",
                buildTimelineControl(opacityBinding, opacity)
              )}
              max={100}
              min={0}
              onValueChange={(value) => setLayerOpacity(layerId, value / 100)}
              value={opacity * 100}
              valueSuffix="%"
            />

            <div className={s.inlineField}>
              <Typography
                className={s.fieldLabel}
                tone="secondary"
                variant="label"
              >
                Blend
              </Typography>
              <Select
                className={s.select ?? ""}
                onValueChange={(value) => {
                  if (value) {
                    setLayerBlendMode(layerId, value as BlendMode)
                  }
                }}
                options={blendModeOptions}
                value={blendMode}
              />
            </div>

            <div className={s.inlineField}>
              <Typography
                className={s.fieldLabel}
                tone="secondary"
                variant="label"
              >
                Mode
              </Typography>
              <Select
                className={s.select ?? ""}
                onValueChange={(value) => {
                  if (value) {
                    setLayerCompositeMode(layerId, value as LayerCompositeMode)
                  }
                }}
                options={compositeModeOptions}
                value={compositeMode}
              />
            </div>

            <Slider
              label={renderFieldLabel(
                "Hue",
                buildTimelineControl(hueBinding, hue)
              )}
              max={180}
              min={-180}
              onValueChange={(value) => setLayerHue(layerId, value)}
              value={hue}
            />

            <Slider
              label={renderFieldLabel(
                "Saturation",
                buildTimelineControl(saturationBinding, saturation)
              )}
              max={2}
              min={0}
              onValueChange={(value) => setLayerSaturation(layerId, value)}
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
          <section className={s.section}>
            {!showGroupedParams && (
              <Typography
                className={s.sectionTitle}
                tone="secondary"
                variant="overline"
              >
                {definitionName}
              </Typography>
            )}

            {showGroupedParams ? (
              <div className={s.groupStack}>
                {groupedParams.map((group) => {
                  const groupKey = `${layerId}:${group.id}`
                  const isExpanded = expandedParamGroups[groupKey] ?? true

                  return (
                    <div className={s.paramGroup} key={group.id}>
                      {group.collapsible ? (
                        <button
                          aria-expanded={isExpanded}
                          className={s.groupToggle}
                          onClick={() => onToggleParamGroup(groupKey)}
                          type="button"
                        >
                          <div className={s.groupHeading}>
                            <span
                              aria-hidden="true"
                              className={
                                isExpanded
                                  ? s.groupChevronExpanded
                                  : s.groupChevron
                              }
                            />
                            <Typography tone="secondary" variant="overline">
                              {group.label}
                            </Typography>
                          </div>
                        </button>
                      ) : (
                        <div className={s.groupHeadingStatic}>
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
                            className={s.groupBodyWrap}
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
                            <div className={s.fieldStack}>
                              {group.params.map((param) => (
                                <ParameterField
                                  definition={param}
                                  key={param.key}
                                  layerId={layerId}
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
              <div className={s.fieldStack}>
                {visibleParams.map((param) => (
                  <ParameterField
                    definition={param}
                    key={param.key}
                    layerId={layerId}
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
