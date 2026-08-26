"use client"

import { DragHandleDots2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ChangeEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useDisplayedTimelineTime } from "@/hooks/use-displayed-timeline-time"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  getAssetAccept,
  inferFileAssetKind,
  isSvgMediaSource,
} from "@/lib/editor/media-file"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import {
  createLayerPropertyBinding,
  useTimelineStore,
} from "@/store/timeline-store"
import type {
  AnimatedPropertyBinding,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
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
import { MeasuringLayoutProvider } from "./properties-sidebar-measure"
import { SceneConfigContent } from "./scene-config-content"

export function PropertiesSidebar() {
  const reduceMotion = useReducedMotion() ?? false
  const [expandedParamGroups, setExpandedParamGroups] = useState<
    Record<string, boolean>
  >({})
  const [livePreviewOverrides, setLivePreviewOverrides] = useState<{
    hue?: number
    opacity?: number
    params: Record<string, ParameterValue>
    saturation?: number
  }>({ params: {} })
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const viewResizeObserverRef = useRef<ResizeObserver | null>(null)
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null)
  const replaceImageLayerIdRef = useRef<string | null>(null)
  const rightSidebarVisible = useEditorStore((state) => state.sidebars.right)
  const mobilePanel = useEditorStore((state) => state.mobilePanel)
  const sidebarView = useEditorStore((state) => state.sidebarView)
  const setSidebarView = useEditorStore((state) => state.setSidebarView)
  const timelineAutoKey = useEditorStore((state) => state.timelineAutoKey)
  const timelinePanelOpen = useEditorStore((state) => state.timelinePanelOpen)
  const beginInteractiveEdit = useEditorStore(
    (state) => state.beginInteractiveEdit
  )
  const endInteractiveEdit = useEditorStore((state) => state.endInteractiveEdit)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const hasLayers = useLayerStore((state) => state.layers.length > 0)
  const selectedLayer = useLayerStore((state) => {
    if (!selectedLayerId) return null
    return state.layers.find((layer) => layer.id === selectedLayerId) ?? null
  })
  const setLayerBlendMode = useLayerStore((state) => state.setLayerBlendMode)
  const setLayerCompositeMode = useLayerStore(
    (state) => state.setLayerCompositeMode
  )
  const setLayerMaskConfig = useLayerStore((state) => state.setLayerMaskConfig)
  const setLayerHue = useLayerStore((state) => state.setLayerHue)
  const setLayerOpacity = useLayerStore((state) => state.setLayerOpacity)
  const randomizeGradientParams = useLayerStore(
    (state) => state.randomizeGradientParams
  )
  const setLayerSaturation = useLayerStore((state) => state.setLayerSaturation)
  const updateLayerParam = useLayerStore((state) => state.updateLayerParam)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const setLayerRuntimeError = useLayerStore(
    (state) => state.setLayerRuntimeError
  )
  const timelineTracks = useTimelineStore((state) => state.tracks)
  const upsertKeyframe = useTimelineStore((state) => state.upsertKeyframe)
  const assets = useAssetStore((state) => state.assets)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const removeAsset = useAssetStore((state) => state.removeAsset)
  const activeGestureDepthRef = useRef(0)
  const activeGestureTimeRef = useRef<number | null>(null)
  const mobilePanelVisible =
    mobilePanel === "properties" || mobilePanel === "scene"

  const resetLivePreviewOverrides = useCallback(() => {
    setLivePreviewOverrides((current) => {
      if (
        current.hue === undefined &&
        current.opacity === undefined &&
        current.saturation === undefined &&
        Object.keys(current.params).length === 0
      ) {
        return current
      }

      return { params: {} }
    })
  }, [])

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

    return selectedDefinition.params.filter((param) => {
      if (
        param.key === "svgRasterResolution" &&
        !(
          selectedAsset &&
          isSvgMediaSource({
            fileName: selectedAsset.fileName,
            mimeType: selectedAsset.mimeType,
          })
        )
      ) {
        return false
      }

      return isParamVisible(
        param,
        selectedLayer.params,
        [...selectedDefinition.params],
        selectedLayer.type
      )
    })
  }, [selectedAsset, selectedDefinition, selectedLayer])

  const selectedLayerTracks = useMemo(
    () =>
      selectedLayer
        ? timelineTracks.filter((track) => track.layerId === selectedLayer.id)
        : [],
    [selectedLayer, timelineTracks]
  )

  const showsAnimatedValues =
    timelinePanelOpen && selectedLayerTracks.length > 0
  const currentTime = useDisplayedTimelineTime(showsAnimatedValues)

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
        hue: livePreviewOverrides.hue ?? selectedLayer.hue,
        opacity: livePreviewOverrides.opacity ?? selectedLayer.opacity,
        params: {
          ...selectedLayer.params,
          ...livePreviewOverrides.params,
        },
        saturation: livePreviewOverrides.saturation ?? selectedLayer.saturation,
      }
    }

    return {
      hue:
        livePreviewOverrides.hue ??
        (typeof evaluatedSelectedLayer.properties.hue === "number"
          ? evaluatedSelectedLayer.properties.hue
          : selectedLayer.hue),
      opacity:
        livePreviewOverrides.opacity ??
        (typeof evaluatedSelectedLayer.properties.opacity === "number"
          ? evaluatedSelectedLayer.properties.opacity
          : selectedLayer.opacity),
      params: {
        ...selectedLayer.params,
        ...evaluatedSelectedLayer.params,
        ...livePreviewOverrides.params,
      },
      saturation:
        livePreviewOverrides.saturation ??
        (typeof evaluatedSelectedLayer.properties.saturation === "number"
          ? evaluatedSelectedLayer.properties.saturation
          : selectedLayer.saturation),
    }
  }, [
    evaluatedSelectedLayer,
    livePreviewOverrides,
    selectedLayer,
    timelinePanelOpen,
  ])

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
    if (selectedLayerId) {
      setSidebarView("properties")
    }
  }, [selectedLayerId, setSidebarView])

  useEffect(() => {
    if (mobilePanel === "scene") {
      setSidebarView("scene")
      return
    }

    if (mobilePanel === "properties") {
      setSidebarView("properties")
    }
  }, [mobilePanel, setSidebarView])

  useEffect(() => {
    return () => {
      viewResizeObserverRef.current?.disconnect()
    }
  }, [])

  useEffect(() => {
    resetLivePreviewOverrides()
  }, [resetLivePreviewOverrides, selectedLayerId])

  useEffect(() => {
    if (activeGestureDepthRef.current > 0) {
      return
    }

    resetLivePreviewOverrides()
  }, [
    currentTime,
    resetLivePreviewOverrides,
    timelineAutoKey,
    timelinePanelOpen,
  ])

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

  const beginPropertyGesture = useCallback(() => {
    if (activeGestureDepthRef.current === 0) {
      activeGestureTimeRef.current = useTimelineStore.getState().currentTime
    }

    activeGestureDepthRef.current += 1
    beginInteractiveEdit()
  }, [beginInteractiveEdit])

  const endPropertyGesture = useCallback(() => {
    activeGestureDepthRef.current = Math.max(
      0,
      activeGestureDepthRef.current - 1
    )

    if (activeGestureDepthRef.current === 0) {
      activeGestureTimeRef.current = null
    }

    endInteractiveEdit()
  }, [endInteractiveEdit])

  useEffect(() => {
    return () => {
      const remainingDepth = activeGestureDepthRef.current

      activeGestureDepthRef.current = 0
      activeGestureTimeRef.current = null

      for (let index = 0; index < remainingDepth; index += 1) {
        endInteractiveEdit()
      }
    }
  }, [endInteractiveEdit])

  const handleTimelineAwareLayerAdjustment = useCallback(
    (
      binding: AnimatedPropertyBinding,
      value: ParameterValue,
      fallback: () => void
    ) => {
      if (
        selectedLayer &&
        hasTrackForBinding(selectedLayerTracks, selectedLayer.id, binding)
      ) {
        if (!timelineAutoKey) {
          if (binding.kind === "layer") {
            const overrideKey =
              binding.property === "hue" ||
              binding.property === "opacity" ||
              binding.property === "saturation"
                ? binding.property
                : null

            if (overrideKey) {
              setLivePreviewOverrides((current) => ({
                ...current,
                [overrideKey]:
                  typeof value === "number" ? value : current[overrideKey],
              }))
            }
          }
          return
        }

        upsertKeyframe({
          binding,
          layerId: selectedLayer.id,
          time: activeGestureTimeRef.current ??
            useTimelineStore.getState().currentTime,
          value,
        })
        return
      }

      fallback()
    },
    [selectedLayer, selectedLayerTracks, timelineAutoKey, upsertKeyframe]
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
        hasTrackForBinding(selectedLayerTracks, selectedLayer.id, binding)
      ) {
        if (!timelineAutoKey) {
          setLivePreviewOverrides((current) => ({
            ...current,
            params: {
              ...current.params,
              [key]: value,
            },
          }))
          return
        }

        upsertKeyframe({
          binding,
          layerId: selectedLayer.id,
          time: activeGestureTimeRef.current ??
            useTimelineStore.getState().currentTime,
          value,
        })
        return
      }

      updateLayerParam(selectedLayer.id, key, value)
    },
    [
      selectedLayer,
      selectedLayerTracks,
      selectedVisibleParams,
      timelineAutoKey,
      updateLayerParam,
      upsertKeyframe,
    ]
  )

  const handleSetLayerHue = useCallback(
    (id: string, value: number) => {
      handleTimelineAwareLayerAdjustment(
        createLayerPropertyBinding("hue"),
        value,
        () => setLayerHue(id, value)
      )
    },
    [handleTimelineAwareLayerAdjustment, setLayerHue]
  )

  const handleSetLayerOpacity = useCallback(
    (id: string, value: number) => {
      handleTimelineAwareLayerAdjustment(
        createLayerPropertyBinding("opacity"),
        value,
        () => setLayerOpacity(id, value)
      )
    },
    [handleTimelineAwareLayerAdjustment, setLayerOpacity]
  )

  const handleSetLayerSaturation = useCallback(
    (id: string, value: number) => {
      handleTimelineAwareLayerAdjustment(
        createLayerPropertyBinding("saturation"),
        value,
        () => setLayerSaturation(id, value)
      )
    },
    [handleTimelineAwareLayerAdjustment, setLayerSaturation]
  )

  const handleUpdateLayerParam = useCallback(
    (id: string, key: string, value: ParameterValue) => {
      if (id === selectedLayerId) {
        handleTimelineAwareParamChange(key, value)
      }
    },
    [handleTimelineAwareParamChange, selectedLayerId]
  )

  const handleReplaceImagePick = useCallback(() => {
    if (!selectedLayerId) {
      return
    }

    replaceImageLayerIdRef.current = selectedLayerId
    replaceImageInputRef.current?.click()
  }, [selectedLayerId])

  const handleReplaceImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const layerId = replaceImageLayerIdRef.current

      event.currentTarget.value = ""
      replaceImageLayerIdRef.current = null

      if (!(file && layerId)) {
        return
      }

      if (inferFileAssetKind(file) !== "image") {
        setLayerRuntimeError(layerId, "Expected an image file.")

        return
      }

      try {
        const asset = await loadAsset(file)

        if (asset.kind !== "image") {
          removeAsset(asset.id)
          setLayerRuntimeError(layerId, "Expected an image file.")

          return
        }

        setLayerAsset(layerId, asset.id)
        setLayerRuntimeError(layerId, null)
      } catch (error) {
        setLayerRuntimeError(
          layerId,
          error instanceof Error ? error.message : "Failed to replace image."
        )
      }
    },
    [loadAsset, removeAsset, setLayerAsset, setLayerRuntimeError]
  )

  const selectedLayerContentProps = selectedLayer
    ? {
        blendMode: selectedLayer.blendMode,
        compositeMode: selectedLayer.compositeMode,
        maskConfig: selectedLayer.maskConfig,
        setLayerMaskConfig,
        definitionName: selectedDefinition?.defaultName ?? selectedLayer.type,
        expandedParamGroups,
        hue: displayedLayerState?.hue ?? selectedLayer.hue,
        onInteractionEnd: endPropertyGesture,
        onInteractionStart: beginPropertyGesture,
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
        onReplaceImage: handleReplaceImagePick,
        onToggleParamGroup: handleToggleParamGroup,
        onTimelineKeyframe: handleTimelineKeyframe,
        opacity: displayedLayerState?.opacity ?? selectedLayer.opacity,
        randomizeGradientParams,
        reduceMotion,
        saturation: displayedLayerState?.saturation ?? selectedLayer.saturation,
        setLayerBlendMode,
        setLayerCompositeMode,
        setLayerHue: handleSetLayerHue,
        setLayerOpacity: handleSetLayerOpacity,
        setLayerSaturation: handleSetLayerSaturation,
        timelinePanelOpen,
        updateLayerParam: handleUpdateLayerParam,
        values: displayedLayerState?.params ?? selectedLayer.params,
        visibleParams: selectedVisibleParams,
      }
    : null

  const renderInvisibleContent = () => {
    if (sidebarView === "scene") return <SceneConfigContent />
    if (selectedLayerContentProps) {
      return <SelectedLayerPropertiesContent {...selectedLayerContentProps} />
    }
    return <EmptyPropertiesContent />
  }

  const renderAnimatedContent = () => {
    if (sidebarView === "scene") {
      return (
        <motion.div
          animate={enterAnimation}
          className="flex h-full min-h-0 flex-col"
          exit={exitAnimation}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          key="scene"
        >
          <SceneConfigContent />
        </motion.div>
      )
    }
    if (selectedLayerContentProps) {
      return (
        <motion.div
          animate={enterAnimation}
          className="flex h-full min-h-0 flex-col"
          exit={exitAnimation}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          key={selectedLayerContentProps.layerId}
        >
          <SelectedLayerPropertiesContent {...selectedLayerContentProps} />
        </motion.div>
      )
    }
    return (
      <motion.div
        animate={enterAnimation}
        className="flex h-full min-h-0 flex-col"
        exit={exitAnimation}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        key="empty"
      >
        <EmptyPropertiesContent />
      </motion.div>
    )
  }

  if (!hasLayers) {
    return null
  }

  return (
    <>
      <input
        accept={getAssetAccept("image")}
        className="hidden"
        onChange={handleReplaceImageChange}
        ref={replaceImageInputRef}
        type="file"
      />

      <aside
        className={cn(
          "pointer-events-none fixed right-3 bottom-[88px] left-3 z-45 translate-y-0 transition-[opacity,translate] duration-[220ms,260ms] ease-[ease-out,cubic-bezier(0.22,1,0.36,1)] min-[900px]:hidden",
          !mobilePanelVisible && "translate-y-3 opacity-0"
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-0 -z-1 w-full"
        >
          <div className="w-full" ref={bindMeasuredView}>
            <MeasuringLayoutProvider>{renderInvisibleContent()}</MeasuringLayoutProvider>
          </div>
        </div>

        <motion.div
          className={cn(
            "pointer-events-auto overflow-hidden rounded-[var(--ds-radius-panel)] max-h-[min(60vh,520px)] w-full",
            !mobilePanelVisible && "pointer-events-none"
          )}
          initial={false}
          {...(panelHeight === null
            ? {}
            : { animate: { height: panelHeight } })}
          transition={heightTransition}
        >
          <GlassPanel
            className="flex h-full min-h-0 flex-col gap-0 p-0"
            variant="panel"
          >
            <AnimatePresence initial={false} mode="wait">
              {renderAnimatedContent()}
            </AnimatePresence>
          </GlassPanel>
        </motion.div>
      </aside>

      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 -z-1 hidden w-full min-[900px]:block"
      >
        <div className="w-full" ref={bindMeasuredView}>
          <MeasuringLayoutProvider>{renderInvisibleContent()}</MeasuringLayoutProvider>
        </div>
      </div>

      {rightSidebarVisible ? (
        <FloatingDesktopPanel
          id="properties"
          resolvePosition={({ panelWidth, viewportWidth }) => ({
            left: viewportWidth - panelWidth - 16,
            top: 76,
          })}
        >
          {({ dragHandleProps, suppressResize: _suppressResize }) => (
            <motion.div
              className="pointer-events-auto overflow-hidden rounded-[var(--ds-radius-panel)] w-[300px]"
              initial={false}
              {...(panelHeight === null
                ? {}
                : { animate: { height: panelHeight } })}
              transition={heightTransition}
            >
              <GlassPanel
                className="flex h-full min-h-0 flex-col gap-0 p-0"
                variant="panel"
              >
                <div className="flex items-center justify-start gap-2 border-b border-[var(--ds-border-divider)] px-3 py-1.5">
                  <div className="inline-flex items-center gap-2">
                    <IconButton
                      aria-label="Move properties panel"
                      className="h-7 w-7 cursor-grab text-[var(--ds-color-text-muted)] active:cursor-grabbing"
                      variant="ghost"
                      {...dragHandleProps}
                    >
                      <DragHandleDots2Icon height={14} width={14} />
                    </IconButton>
                    <Typography tone="secondary" variant="overline">
                      {sidebarView === "scene" ? "Scene" : "Properties"}
                    </Typography>
                  </div>
                </div>
                <AnimatePresence initial={false} mode="wait">
                  {renderAnimatedContent()}
                </AnimatePresence>
              </GlassPanel>
            </motion.div>
          )}
        </FloatingDesktopPanel>
      ) : null}
    </>
  )
}
