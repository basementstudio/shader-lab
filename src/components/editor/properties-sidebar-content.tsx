"use client"

import { TextAlignRightIcon } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { CUSTOM_SHADER_ENTRY_EXPORT } from "@/lib/editor/custom-shader/shared"
import { formatCustomShaderSource } from "@/renderer/custom-shader-runtime"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type {
  AnimatedPropertyBinding,
  BlendMode,
  LayerCompositeMode,
  LayerType,
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
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
      <Typography className="uppercase" tone="secondary" variant="overline">
        Shader
      </Typography>

      <div className="flex flex-col gap-[10px]">
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

function ModelLayerSection({
  layerId,
  updateLayerParam,
  values,
}: {
  layerId: string
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  values: Record<string, ParameterValue>
}) {
  const modelInputRef = useRef<HTMLInputElement | null>(null)
  const svgInputRef = useRef<HTMLInputElement | null>(null)
  const geometrySource =
    values.geometrySource === "svg-badge" ? "svg-badge" : "model"
  const svgFileName =
    typeof values.svgFileName === "string" ? values.svgFileName : ""
  const svgSourceRevision =
    typeof values.svgSourceRevision === "number" ? values.svgSourceRevision : 0
  const badgeThickness =
    typeof values.badgeThickness === "number" ? values.badgeThickness : 0.18
  const layerAssetId = useLayerStore(
    (state) =>
      state.layers.find((layer) => layer.id === layerId)?.assetId ?? null
  )
  const currentAsset = useAssetStore(
    (state) => state.assets.find((asset) => asset.id === layerAssetId) ?? null
  )
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const animationNames = useMemo(() => {
    if (typeof values.animationNames !== "string") {
      return [] as string[]
    }

    try {
      const parsed = JSON.parse(values.animationNames)
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : []
    } catch {
      return []
    }
  }, [values.animationNames])
  const activeAnimation =
    typeof values.activeAnimation === "string" ? values.activeAnimation : ""
  const animationPlaying = values.animationPlaying !== false
  const animationLoop = values.animationLoop !== false
  const animationSpeed =
    typeof values.animationSpeed === "number" ? values.animationSpeed : 1

  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0">
      <Typography className="uppercase" tone="secondary" variant="overline">
        Source
      </Typography>

      <div className="flex flex-col gap-[10px]">
        <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
          <Typography className="min-w-0" tone="secondary" variant="label">
            Geometry
          </Typography>
          <Select
            className="w-[132px]"
            onValueChange={(value) => {
              if (!value) {
                return
              }

              updateLayerParam(layerId, "geometrySource", value)
            }}
            options={[
              { label: "3D Model", value: "model" },
              { label: "SVG Badge", value: "svg-badge" },
            ]}
            triggerClassName="w-[132px]"
            value={geometrySource}
          />
        </div>

        {geometrySource === "svg-badge" ? (
          <>
            <input
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]

                if (!file) {
                  return
                }

                void file.text().then((content) => {
                  updateLayerParam(layerId, "svgSource", content)
                  updateLayerParam(layerId, "svgFileName", file.name)
                  updateLayerParam(
                    layerId,
                    "svgSourceRevision",
                    svgSourceRevision + 1
                  )
                })

                event.currentTarget.value = ""
              }}
              ref={svgInputRef}
              type="file"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                onClick={() => svgInputRef.current?.click()}
                size="compact"
                variant="primary"
              >
                {svgFileName ? "Replace SVG" : "Upload SVG"}
              </Button>

              {svgFileName ? (
                <Button
                  onClick={() => {
                    updateLayerParam(layerId, "svgSource", "")
                    updateLayerParam(layerId, "svgFileName", "")
                    updateLayerParam(
                      layerId,
                      "svgSourceRevision",
                      svgSourceRevision + 1
                    )
                  }}
                  size="compact"
                  variant="ghost"
                >
                  Clear
                </Button>
              ) : null}
            </div>

            <Typography tone="muted" variant="caption">
              {svgFileName || "Single filled-shape SVGs work best in v1."}
            </Typography>

            <Slider
              label="Coin Thickness"
              max={0.75}
              min={0.04}
              onValueChange={(value) =>
                updateLayerParam(layerId, "badgeThickness", value)
              }
              step={0.01}
              value={badgeThickness}
              valueFormatOptions={{
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              }}
            />
          </>
        ) : (
          <>
            <input
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json,application/octet-stream"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]

                if (!file) {
                  return
                }

                void loadAsset(file)
                  .then((asset) => {
                    setLayerAsset(layerId, asset.id)
                  })
                  .catch(() => {
                    // Ignore store error here; the renderer will surface a runtime error if needed.
                  })

                event.currentTarget.value = ""
              }}
              ref={modelInputRef}
              type="file"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                onClick={() => modelInputRef.current?.click()}
                size="compact"
                variant="primary"
              >
                {currentAsset ? "Replace Model" : "Upload Model"}
              </Button>

              {currentAsset ? (
                <Button
                  onClick={() => setLayerAsset(layerId, null)}
                  size="compact"
                  variant="ghost"
                >
                  Clear
                </Button>
              ) : null}
            </div>

            <Typography tone="muted" variant="caption">
              {currentAsset?.fileName ||
                "Upload a GLB or GLTF asset for this layer."}
            </Typography>
          </>
        )}

        {geometrySource === "model" && animationNames.length > 0 ? (
          <div className="flex flex-col gap-[10px] border-t border-[var(--ds-border-divider)] pt-3">
            <Typography
              className="uppercase"
              tone="secondary"
              variant="overline"
            >
              Animation
            </Typography>

            <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
              <Typography className="min-w-0" tone="secondary" variant="label">
                Clip
              </Typography>
              <Select
                className="w-[132px]"
                onValueChange={(value) => {
                  if (value) {
                    updateLayerParam(layerId, "activeAnimation", value)
                  }
                }}
                options={animationNames.map((name) => ({
                  label: name,
                  value: name,
                }))}
                triggerClassName="w-[132px]"
                value={activeAnimation || animationNames[0] || ""}
              />
            </div>

            <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_auto]">
              <Typography className="min-w-0" tone="secondary" variant="label">
                Play
              </Typography>
              <Toggle
                checked={animationPlaying}
                className="justify-self-end"
                onCheckedChange={(checked) =>
                  updateLayerParam(layerId, "animationPlaying", checked)
                }
              />
            </div>

            <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_auto]">
              <Typography className="min-w-0" tone="secondary" variant="label">
                Loop
              </Typography>
              <Toggle
                checked={animationLoop}
                className="justify-self-end"
                onCheckedChange={(checked) =>
                  updateLayerParam(layerId, "animationLoop", checked)
                }
              />
            </div>

            <Slider
              label="Animation Speed"
              max={4}
              min={0}
              onValueChange={(value) =>
                updateLayerParam(layerId, "animationSpeed", value)
              }
              step={0.01}
              value={animationSpeed}
              valueFormatOptions={{
                maximumFractionDigits: 2,
                minimumFractionDigits: 0,
              }}
            />
          </div>
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
  const filteredVisibleParams = useMemo(() => {
    if (layerType !== "model") {
      return visibleParams
    }

    return visibleParams.filter((param) => param.key !== "badgeThickness")
  }, [layerType, visibleParams])

  const groupedParams = useMemo(
    () => groupVisibleParams(filteredVisibleParams),
    [filteredVisibleParams]
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

      <div className="flex min-h-0 max-h-[min(62vh,620px)] flex-col gap-0 overflow-y-auto">
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
              onValueChange={(value) => setLayerOpacity(layerId, value / 100)}
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

        {layerType === "model" ? (
          <ModelLayerSection
            layerId={layerId}
            updateLayerParam={updateLayerParam}
            values={values}
          />
        ) : null}

        {filteredVisibleParams.length > 0 ? (
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
                {filteredVisibleParams.map((param) => (
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
