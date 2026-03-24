"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import type {
  AnimatedPropertyBinding,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
import { cn } from "@/lib/cn"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import {
  createLayerPropertyBinding,
  useTimelineStore,
} from "@/store/timeline-store"
import {
  EmptyPropertiesContent,
  SelectedLayerPropertiesContent,
} from "./properties-sidebar-content"
import {
  createParamTimelineBinding,
  getSelectedAsset,
  hasTrackForBinding,
  isParamVisible,
} from "./properties-sidebar-utils"

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
  const currentTime = useTimelineStore((state) => state.currentTime)
  const timelineTracks = useTimelineStore((state) => state.tracks)
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
  const selectedVisibleParams = useMemo(() => {
    if (!(selectedLayer && selectedDefinition)) {
      return [] as ParameterDefinition[]
    }

    return selectedDefinition.params.filter((param) =>
      isParamVisible(param, selectedLayer.params, [
        ...selectedDefinition.params,
      ])
    )
  }, [selectedDefinition, selectedLayer])

  const selectedLayerTracks = useMemo(
    () =>
      selectedLayer
        ? timelineTracks.filter((track) => track.layerId === selectedLayer.id)
        : [],
    [selectedLayer, timelineTracks]
  )

  const evaluatedSelectedLayer = useMemo(() => {
    if (
      !(timelinePanelOpen && selectedLayer && selectedLayerTracks.length > 0)
    ) {
      return null
    }

    return (
      evaluateTimelineForLayers(
        [selectedLayer],
        selectedLayerTracks,
        currentTime
      )[0] ?? null
    )
  }, [currentTime, selectedLayer, selectedLayerTracks, timelinePanelOpen])

  const displayedLayerState = useMemo(() => {
    if (!selectedLayer) {
      return null
    }

    if (!(timelinePanelOpen && evaluatedSelectedLayer)) {
      return {
        hue: selectedLayer.hue,
        opacity: selectedLayer.opacity,
        params: selectedLayer.params,
        saturation: selectedLayer.saturation,
      }
    }

    return {
      hue:
        typeof evaluatedSelectedLayer.properties.hue === "number"
          ? evaluatedSelectedLayer.properties.hue
          : selectedLayer.hue,
      opacity:
        typeof evaluatedSelectedLayer.properties.opacity === "number"
          ? evaluatedSelectedLayer.properties.opacity
          : selectedLayer.opacity,
      params: {
        ...selectedLayer.params,
        ...evaluatedSelectedLayer.params,
      },
      saturation:
        typeof evaluatedSelectedLayer.properties.saturation === "number"
          ? evaluatedSelectedLayer.properties.saturation
          : selectedLayer.saturation,
    }
  }, [evaluatedSelectedLayer, selectedLayer, timelinePanelOpen])

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

  const handleTimelineAwareLayerAdjustment = useCallback(
    (
      binding: AnimatedPropertyBinding,
      value: ParameterValue,
      fallback: () => void
    ) => {
      if (
        selectedLayer &&
        timelinePanelOpen &&
        hasTrackForBinding(selectedLayerTracks, selectedLayer.id, binding)
      ) {
        upsertKeyframe({
          binding,
          layerId: selectedLayer.id,
          time: currentTime,
          value,
        })
        return
      }

      fallback()
    },
    [
      currentTime,
      selectedLayer,
      selectedLayerTracks,
      timelinePanelOpen,
      upsertKeyframe,
    ]
  )

  const handleTimelineAwareParamChange = useCallback(
    (key: string, value: ParameterValue) => {
      if (!selectedLayer) {
        return
      }

      const definition =
        selectedVisibleParams.find((param) => param.key === key) ?? null
      const binding = definition ? createParamTimelineBinding(definition) : null

      if (
        binding &&
        timelinePanelOpen &&
        hasTrackForBinding(selectedLayerTracks, selectedLayer.id, binding)
      ) {
        upsertKeyframe({
          binding,
          layerId: selectedLayer.id,
          time: currentTime,
          value,
        })
        return
      }

      updateLayerParam(selectedLayer.id, key, value)
    },
    [
      currentTime,
      selectedLayer,
      selectedLayerTracks,
      selectedVisibleParams,
      timelinePanelOpen,
      updateLayerParam,
      upsertKeyframe,
    ]
  )

  const selectedLayerContentProps = selectedLayer
    ? {
        blendMode: selectedLayer.blendMode,
        compositeMode: selectedLayer.compositeMode,
        definitionName: selectedDefinition?.defaultName ?? selectedLayer.type,
        expandedParamGroups,
        hue: displayedLayerState?.hue ?? selectedLayer.hue,
        layerId: selectedLayer.id,
        layerKind: selectedDefinition?.kind ?? "effect",
        layerName: selectedLayer.name,
        layerRuntimeError: selectedLayer.runtimeError,
        layerSubtitle:
          selectedAsset?.fileName ??
          (selectedLayer.type === "custom-shader" &&
          typeof selectedLayer.params.sourceFileName === "string"
            ? selectedLayer.params.sourceFileName
            : ""),
        layerType: selectedLayer.type,
        onToggleParamGroup: handleToggleParamGroup,
        onTimelineKeyframe: handleTimelineKeyframe,
        opacity: displayedLayerState?.opacity ?? selectedLayer.opacity,
        reduceMotion,
        saturation: displayedLayerState?.saturation ?? selectedLayer.saturation,
        setLayerBlendMode,
        setLayerCompositeMode,
        setLayerHue: (id: string, value: number) =>
          handleTimelineAwareLayerAdjustment(
            createLayerPropertyBinding("hue"),
            value,
            () => setLayerHue(id, value)
          ),
        setLayerOpacity: (id: string, value: number) =>
          handleTimelineAwareLayerAdjustment(
            createLayerPropertyBinding("opacity"),
            value,
            () => setLayerOpacity(id, value)
          ),
        setLayerSaturation: (id: string, value: number) =>
          handleTimelineAwareLayerAdjustment(
            createLayerPropertyBinding("saturation"),
            value,
            () => setLayerSaturation(id, value)
          ),
        timelinePanelOpen,
        updateLayerParam: (id: string, key: string, value: ParameterValue) => {
          if (id === selectedLayer.id) {
            handleTimelineAwareParamChange(key, value)
          }
        },
        values: displayedLayerState?.params ?? selectedLayer.params,
        visibleParams: selectedVisibleParams,
      }
    : null

  return (
    <aside
      className={cn(
        "pointer-events-none absolute top-[76px] right-4 z-20 w-[300px] translate-x-0 transition-[opacity,translate] duration-[220ms,260ms] ease-[ease-out,cubic-bezier(0.22,1,0.36,1)]",
        !rightSidebarVisible && "translate-x-[18px] opacity-0"
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 -z-1 w-full"
      >
        <div className="w-full" ref={bindMeasuredView}>
          {selectedLayerContentProps ? (
            <SelectedLayerPropertiesContent {...selectedLayerContentProps} />
          ) : (
            <EmptyPropertiesContent />
          )}
        </div>
      </div>

      <motion.div
        className={cn(
          "pointer-events-auto overflow-hidden rounded-[var(--ds-radius-panel)]",
          !rightSidebarVisible && "pointer-events-none"
        )}
        initial={false}
        {...(panelHeight === null ? {} : { animate: { height: panelHeight } })}
        transition={heightTransition}
      >
        <GlassPanel
          className="flex h-full min-h-0 flex-col gap-0 p-0"
          variant="panel"
        >
          <AnimatePresence initial={false} mode="wait">
            {selectedLayerContentProps ? (
              <motion.div
                animate={enterAnimation}
                className="flex h-full min-h-0 flex-col"
                exit={exitAnimation}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                key={selectedLayerContentProps.layerId}
              >
                <SelectedLayerPropertiesContent
                  {...selectedLayerContentProps}
                />
              </motion.div>
            ) : (
              <motion.div
                animate={enterAnimation}
                className="flex h-full min-h-0 flex-col"
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
