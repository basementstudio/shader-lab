"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getLayerDefinition } from "@/features/editor/config/layer-registry"
import type {
  AnimatedPropertyBinding,
  BlendMode,
  EditorAsset,
  LayerCompositeMode,
  ParameterDefinition,
  ParameterValue,
  SelectParameterDefinition,
  TextParameterDefinition,
} from "@/features/editor/types"
import { cn } from "@/shared/lib/cn"
import { ColorPicker } from "@/shared/ui/color-picker"
import { GlassPanel } from "@/shared/ui/glass-panel"
import { IconButton } from "@/shared/ui/icon-button"
import { Select } from "@/shared/ui/select"
import { Slider } from "@/shared/ui/slider"
import { Toggle } from "@/shared/ui/toggle"
import { Typography } from "@/shared/ui/typography"
import { XYPad } from "@/shared/ui/xy-pad"
import { useAssetStore } from "@/store/assetStore"
import { useEditorStore } from "@/store/editorStore"
import { useLayerStore } from "@/store/layerStore"
import {
  createLayerPropertyBinding,
  useTimelineStore,
} from "@/store/timelineStore"
import s from "./properties-sidebar.module.css"

const blendModeOptions = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Darken", value: "darken" },
  { label: "Lighten", value: "lighten" },
] as const

const compositeModeOptions = [
  { label: "Filter", value: "filter" },
  { label: "Mask", value: "mask" },
] as const

const COLLAPSIBLE_PARAM_GROUPS = new Set(["Points"])
const DEFAULT_PARAM_GROUP = "Settings"

function getSelectedAsset(
  assetById: Map<string, EditorAsset>,
  assetId: string | null
): EditorAsset | null {
  if (!assetId) {
    return null
  }

  return assetById.get(assetId) ?? null
}

function formatLayerKind(kind: string): string {
  if (kind === "source") {
    return "Source"
  }

  return kind
}

function toColorValue(value: ParameterValue): string {
  return typeof value === "string" ? value : "#ffffff"
}

function toVec2Value(value: ParameterValue): [number, number] {
  return Array.isArray(value) && value.length === 2
    ? [value[0] ?? 0, value[1] ?? 0]
    : [0, 0]
}

function toNumberValue(value: ParameterValue, fallback = 0): number {
  return typeof value === "number" ? value : fallback
}

function toBooleanValue(value: ParameterValue): boolean {
  return value === true
}

function toTextValue(value: ParameterValue, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function resolveParamValue(
  params: Record<string, ParameterValue>,
  definitions: ParameterDefinition[],
  key: string
): ParameterValue | undefined {
  const explicitValue = params[key]
  if (explicitValue !== undefined) {
    return explicitValue
  }

  const definition = definitions.find((entry) => entry.key === key)
  return definition?.defaultValue
}

function isParamVisible(
  definition: ParameterDefinition,
  params: Record<string, ParameterValue>,
  definitions: ParameterDefinition[]
): boolean {
  if (!definition.visibleWhen) {
    return true
  }

  const controllingValue = resolveParamValue(
    params,
    definitions,
    definition.visibleWhen.key
  )

  if ("equals" in definition.visibleWhen) {
    return controllingValue === definition.visibleWhen.equals
  }

  return (
    typeof controllingValue === "number" &&
    controllingValue >= definition.visibleWhen.gte
  )
}

type ParamGroup = {
  collapsible: boolean
  id: string
  label: string
  params: ParameterDefinition[]
}

function groupVisibleParams(params: ParameterDefinition[]): ParamGroup[] {
  const groups = new Map<string, ParamGroup>()

  for (const param of params) {
    const label = param.group ?? DEFAULT_PARAM_GROUP
    const id = label.toLowerCase().replace(/\s+/g, "-")
    const existing = groups.get(id)

    if (existing) {
      existing.params.push(param)
      continue
    }

    groups.set(id, {
      collapsible: COLLAPSIBLE_PARAM_GROUPS.has(label),
      id,
      label,
      params: [param],
    })
  }

  return [...groups.values()]
}

function createParamTimelineBinding(
  definition: ParameterDefinition
): AnimatedPropertyBinding | null {
  if (definition.type === "text") {
    return null
  }

  return {
    key: definition.key,
    kind: "param",
    label: definition.label,
    valueType: definition.type === "boolean" ? "boolean" : definition.type,
  }
}

function EmptyPropertiesContent() {
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

type TimelineKeyframeControl = {
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
    animation = control.reduceMotion
      ? { opacity: 1 }
      : { opacity: 1, scale: 1 }
  } else {
    animation = control.reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.82 }
  }

  return (
    <span className={s.fieldActionSlot}>
      <motion.span
        animate={animation}
        className={s.fieldActionWrap}
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
            s.timelineKeyframeButton,
            control.hasTrack && s.timelineKeyframeButtonActive
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

function renderFieldLabel(
  label: string,
  control: TimelineKeyframeControl | null
) {
  return (
    <span className={s.fieldLabelRow}>
      <span>{label}</span>
      <TimelineKeyframeButton control={control} />
    </span>
  )
}

function SelectedLayerPropertiesContent({
  blendMode,
  compositeMode,
  definitionName,
  expandedParamGroups,
  layerId,
  layerKind,
  layerName,
  layerRuntimeError,
  layerSubtitle,
  layerType,
  onToggleParamGroup,
  opacity,
  onTimelineKeyframe,
  reduceMotion,
  hue,
  saturation,
  setLayerBlendMode,
  setLayerCompositeMode,
  setLayerHue,
  setLayerOpacity,
  setLayerSaturation,
  timelinePanelOpen,
  updateLayerParam,
  visibleParams,
  values,
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
  layerType: string
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

  const opacityBinding = createLayerPropertyBinding("opacity")
  const hueBinding = createLayerPropertyBinding("hue")
  const saturationBinding = createLayerPropertyBinding("saturation")
  const timelineTracks = useTimelineStore((state) => state.tracks)

  const hasTrack = useCallback(
    (binding: AnimatedPropertyBinding) =>
      timelineTracks.some(
        (track) =>
          track.layerId === layerId &&
          JSON.stringify(track.binding) === JSON.stringify(binding)
      ),
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
        <Typography tone="muted" variant="monoXs">
          {layerSubtitle || layerType}
        </Typography>
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

        {visibleParams.length > 0 ? (
          <section className={s.section}>
            <Typography
              className={s.sectionTitle}
              tone="secondary"
              variant="overline"
            >
              {definitionName}
            </Typography>

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
                              className={
                                isExpanded
                                  ? s.groupChevronExpanded
                                  : s.groupChevron
                              }
                              aria-hidden="true"
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

export function PropertiesSidebar() {
  const reduceMotion = useReducedMotion() ?? false
  const [expandedParamGroups, setExpandedParamGroups] = useState<
    Record<string, boolean>
  >({})
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const viewResizeObserverRef = useRef<ResizeObserver | null>(null)
  const rightSidebarVisible = useEditorStore((state) => state.sidebars.right)
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const selectedLayer = useLayerStore((state) =>
    selectedLayerId
      ? (state.layers.find((layer) => layer.id === selectedLayerId) ?? null)
      : null
  )
  const setLayerBlendMode = useLayerStore((state) => state.setLayerBlendMode)
  const setLayerCompositeMode = useLayerStore(
    (state) => state.setLayerCompositeMode
  )
  const setLayerHue = useLayerStore((state) => state.setLayerHue)
  const setLayerOpacity = useLayerStore((state) => state.setLayerOpacity)
  const setLayerSaturation = useLayerStore((state) => state.setLayerSaturation)
  const updateLayerParam = useLayerStore((state) => state.updateLayerParam)
  const upsertKeyframe = useTimelineStore((state) => state.upsertKeyframe)
  const assets = useAssetStore((state) => state.assets)

  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  )

  const selectedAsset = selectedLayer
    ? getSelectedAsset(assetById, selectedLayer.assetId)
    : null
  const selectedDefinition = selectedLayer
    ? getLayerDefinition(selectedLayer.type)
    : null
  let selectedVisibleParams: ParameterDefinition[] = []

  if (selectedLayer && selectedDefinition) {
    selectedVisibleParams = selectedDefinition.params.filter((param) =>
      isParamVisible(param, selectedLayer.params, [
        ...selectedDefinition.params,
      ])
    )
  }

  const heightTransition = reduceMotion
    ? { duration: 0.12, ease: "easeOut" as const }
    : {
        damping: 34,
        mass: 0.9,
        stiffness: 340,
        type: "spring" as const,
      }
  const exitTransition = reduceMotion
    ? { duration: 0.1, ease: "easeOut" as const }
    : {
        damping: 34,
        mass: 0.8,
        stiffness: 380,
        type: "spring" as const,
      }
  const enterTransition = reduceMotion
    ? { duration: 0.12, ease: "easeOut" as const }
    : {
        damping: 34,
        delay: 0.08,
        mass: 0.82,
        stiffness: 380,
        type: "spring" as const,
      }
  const enterAnimation = reduceMotion
    ? { opacity: 1, transition: { duration: 0.12, ease: "easeOut" as const } }
    : {
        opacity: 1,
        transition: {
          opacity: { delay: 0.08, duration: 0.12 },
          y: enterTransition,
        },
        y: 0,
      }
  const exitAnimation = reduceMotion
    ? { opacity: 0, transition: { duration: 0.1, ease: "easeOut" as const } }
    : {
        opacity: 0,
        transition: {
          opacity: { duration: 0.1 },
          y: exitTransition,
        },
        y: -10,
      }

  const bindMeasuredView = useCallback((node: HTMLDivElement | null) => {
    viewResizeObserverRef.current?.disconnect()
    viewResizeObserverRef.current = null

    if (!node) {
      return
    }

    const updateHeight = () => {
      setPanelHeight(Math.ceil(node.getBoundingClientRect().height) + 2)
    }

    updateHeight()

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    observer.observe(node)
    viewResizeObserverRef.current = observer
  }, [])

  useEffect(() => {
    return () => {
      viewResizeObserverRef.current?.disconnect()
    }
  }, [])

  const handleToggleParamGroup = useCallback((groupId: string) => {
    setExpandedParamGroups((current) => ({
      ...current,
      [groupId]: !(current[groupId] ?? true),
    }))
  }, [])

  const handleTimelineKeyframe = useCallback(
    (
      binding: AnimatedPropertyBinding,
      layerId: string,
      value: ParameterValue
    ) => {
      upsertKeyframe({
        binding,
        layerId,
        value,
      })
    },
    [upsertKeyframe]
  )

  return (
    <aside className={cn(s.root, !rightSidebarVisible && s.rootHidden)}>
      <div aria-hidden="true" className={s.measureWrap}>
        <div className={s.measureView} ref={bindMeasuredView}>
          {selectedLayer ? (
            <SelectedLayerPropertiesContent
              blendMode={selectedLayer.blendMode}
              compositeMode={selectedLayer.compositeMode}
              definitionName={
                selectedDefinition?.defaultName ?? selectedLayer.type
              }
              expandedParamGroups={expandedParamGroups}
              hue={selectedLayer.hue}
              layerId={selectedLayer.id}
              layerKind={selectedLayer.type}
              layerName={selectedLayer.name}
              layerRuntimeError={selectedLayer.runtimeError}
              layerSubtitle={selectedAsset?.fileName ?? selectedLayer.type}
              layerType={selectedLayer.type}
              onToggleParamGroup={handleToggleParamGroup}
              opacity={selectedLayer.opacity}
              onTimelineKeyframe={handleTimelineKeyframe}
              reduceMotion={reduceMotion}
              saturation={selectedLayer.saturation}
              setLayerBlendMode={setLayerBlendMode}
              setLayerCompositeMode={setLayerCompositeMode}
              setLayerHue={setLayerHue}
              setLayerOpacity={setLayerOpacity}
              setLayerSaturation={setLayerSaturation}
              timelinePanelOpen={timelinePanelOpen}
              updateLayerParam={updateLayerParam}
              values={selectedLayer.params}
              visibleParams={selectedVisibleParams}
            />
          ) : (
            <EmptyPropertiesContent />
          )}
        </div>
      </div>

      <motion.div
        className={s.panelWrap}
        initial={false}
        {...(panelHeight === null ? {} : { animate: { height: panelHeight } })}
        transition={heightTransition}
      >
        <GlassPanel className={s.panel} variant="panel">
          <AnimatePresence initial={false} mode="wait">
            {selectedLayer ? (
              <motion.div
                animate={enterAnimation}
                className={s.layerView}
                exit={exitAnimation}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                key={selectedLayer.id}
              >
                <SelectedLayerPropertiesContent
                  blendMode={selectedLayer.blendMode}
                  compositeMode={selectedLayer.compositeMode}
                  definitionName={
                    selectedDefinition?.defaultName ?? selectedLayer.type
                  }
                  expandedParamGroups={expandedParamGroups}
                  hue={selectedLayer.hue}
                  layerId={selectedLayer.id}
                  layerKind={selectedLayer.type}
                  layerName={selectedLayer.name}
                  layerRuntimeError={selectedLayer.runtimeError}
                  layerSubtitle={selectedAsset?.fileName ?? selectedLayer.type}
                  layerType={selectedLayer.type}
                  onToggleParamGroup={handleToggleParamGroup}
                  opacity={selectedLayer.opacity}
                  onTimelineKeyframe={handleTimelineKeyframe}
                  reduceMotion={reduceMotion}
                  saturation={selectedLayer.saturation}
                  setLayerBlendMode={setLayerBlendMode}
                  setLayerCompositeMode={setLayerCompositeMode}
                  setLayerHue={setLayerHue}
                  setLayerOpacity={setLayerOpacity}
                  setLayerSaturation={setLayerSaturation}
                  timelinePanelOpen={timelinePanelOpen}
                  updateLayerParam={updateLayerParam}
                  values={selectedLayer.params}
                  visibleParams={selectedVisibleParams}
                />
              </motion.div>
            ) : (
              <motion.div
                animate={enterAnimation}
                className={s.layerView}
                exit={exitAnimation}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                key="empty"
              >
                <EmptyPropertiesContent />
              </motion.div>
            )}
          </AnimatePresence>
        </GlassPanel>
      </motion.div>
    </aside>
  )
}

function ParameterField({
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
  const timelineTracks = useTimelineStore((state) => state.tracks)
  const timelineControl: TimelineKeyframeControl | null = timelineBinding
    ? {
        binding: timelineBinding,
        hasTrack: timelineTracks.some(
          (track) =>
            track.layerId === layerId &&
            JSON.stringify(track.binding) === JSON.stringify(timelineBinding)
        ),
        layerId,
        onKeyframe: onTimelineKeyframe,
        reduceMotion,
        timelinePanelOpen,
        value,
      }
    : null

  switch (definition.type) {
    case "number":
      return (
        <Slider
          label={renderFieldLabel(definition.label, timelineControl)}
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
        <div className={s.inlineField}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            {renderFieldLabel(definition.label, timelineControl)}
          </Typography>
          <Select
            className={s.select ?? ""}
            onValueChange={(nextValue) => {
              if (nextValue) {
                onChange(layerId, definition.key, nextValue)
              }
            }}
            options={(definition as SelectParameterDefinition).options}
            value={typeof value === "string" ? value : definition.defaultValue}
          />
        </div>
      )

    case "boolean":
      return (
        <div className={s.inlineFieldCompact}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            {renderFieldLabel(definition.label, timelineControl)}
          </Typography>
          <Toggle
            checked={toBooleanValue(value)}
            className={s.toggleWrap ?? ""}
            onCheckedChange={(nextValue) =>
              onChange(layerId, definition.key, nextValue)
            }
          />
        </div>
      )

    case "color":
      return (
        <div className={s.inlineField}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            {renderFieldLabel(definition.label, timelineControl)}
          </Typography>
          <ColorPicker
            onValueChange={(nextValue) =>
              onChange(layerId, definition.key, nextValue)
            }
            value={toColorValue(value)}
          />
        </div>
      )

    case "vec2": {
      return (
        <XYPad
          label={renderFieldLabel(definition.label, timelineControl)}
          max={definition.max ?? 1}
          min={definition.min ?? -1}
          onValueChange={(nextValue) =>
            onChange(layerId, definition.key, nextValue)
          }
          step={definition.step ?? 0.01}
          value={toVec2Value(value)}
        />
      )
    }

    case "text":
      return (
        <label className={s.textField}>
          <Typography className={s.fieldLabel} tone="secondary" variant="label">
            {renderFieldLabel(definition.label, timelineControl)}
          </Typography>
          <input
            className={s.textInput}
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
