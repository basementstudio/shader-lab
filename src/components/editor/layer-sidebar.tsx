"use client"
import {
  DotsVerticalIcon,
  DragHandleDots2Icon,
  EyeClosedIcon,
  EyeOpenIcon,
  FileIcon,
  LayoutIcon,
  TrashIcon,
} from "@radix-ui/react-icons"
import { Reorder, useDragControls } from "motion/react"
import {
  type ChangeEvent,
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import {
  type AddLayerAction,
  LayerPicker,
} from "@/components/editor/layer-picker"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { inferFileAssetKind } from "@/lib/editor/media-file"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import type { AssetKind, EditorAsset, EditorLayer } from "@/types/editor"

type LayerAction = "delete" | "reset"

const thumbnailBaseClassName =
  "relative h-7 w-7 overflow-hidden rounded-[var(--ds-radius-thumb)] border border-white/6 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.07),rgb(255_255_255_/_0.03))]"

function getLayerSecondaryText(
  layer: EditorLayer,
  asset: EditorAsset | null
): string {
  if (layer.runtimeError) {
    return layer.runtimeError
  }

  if (
    layer.type === "image" ||
    layer.type === "video" ||
    layer.type === "model"
  ) {
    return asset?.fileName ?? "No asset selected"
  }

  if (layer.type === "live") {
    return "webcam"
  }

  if (layer.type === "custom-shader") {
    return (
      (typeof layer.params.sourceFileName === "string" &&
        layer.params.sourceFileName) ||
      "custom shader"
    )
  }

  if (layer.type === "text") {
    return (
      (typeof layer.params.text === "string" && layer.params.text.trim()) ||
      "text"
    )
  }

  return layer.type.replaceAll("-", " ")
}

function getThumbnailClassName(
  layer: EditorLayer,
  asset: EditorAsset | null
): string {
  if (asset?.kind === "image" || asset?.kind === "video") {
    return cn(thumbnailBaseClassName, "bg-center bg-cover")
  }

  if (layer.type === "model") {
    return cn(
      thumbnailBaseClassName,
      "bg-[radial-gradient(circle_at_30%_30%,rgb(255_255_255_/_0.18),transparent_45%),linear-gradient(135deg,rgb(255_255_255_/_0.08),rgb(255_255_255_/_0.02))]"
    )
  }

  return cn(
    thumbnailBaseClassName,
    "bg-[linear-gradient(135deg,rgb(255_255_255_/_0.1),rgb(255_255_255_/_0.03)),linear-gradient(180deg,rgb(255_255_255_/_0.05),transparent)] after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent,rgb(255_255_255_/_0.18),transparent)] after:opacity-[0.35] after:content-['']"
  )
}

function getExpectedAssetKind(layer: EditorLayer): AssetKind | null {
  if (
    layer.type === "image" ||
    layer.type === "video" ||
    layer.type === "model"
  ) {
    return layer.type
  }

  return null
}

function getAcceptForAssetKind(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "image/png,image/jpeg,image/webp,image/gif"
    case "video":
      return "video/mp4,video/webm,video/quicktime,.mov"
    case "model":
      return ".glb,.gltf,.obj,model/gltf-binary,model/gltf+json,model/obj,application/octet-stream"
  }
}

function inferSelectedFileKind(file: File): AssetKind | null {
  return inferFileAssetKind(file)
}

type LayerListItemProps = {
  asset: EditorAsset | null
  hasMissingAsset: boolean
  isFloatingPanelDragging: boolean
  isSelected: boolean
  layer: EditorLayer
  layerActionKey: number
  onLayerAction: (layerId: string, action: LayerAction) => void
  onRelinkPick: (layer: EditorLayer) => void
  onSelectLayer: (
    layerId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => void
  onSetLayerVisibility: (layerId: string, visible: boolean) => void
}

const LAYER_ACTION_OPTIONS = [
  { label: "Reset properties", value: "reset" },
  { label: "Delete layer", value: "delete" },
] as const satisfies readonly {
  label: ReactNode
  value: LayerAction
}[]

function LayerListShell({
  children,
  isFloatingPanelDragging,
  onReorder,
  values,
}: {
  children: ReactNode
  isFloatingPanelDragging: boolean
  onReorder: (nextLayers: EditorLayer[]) => void
  values: EditorLayer[]
}) {
  const className =
    "flex max-h-[min(52vh,480px)] flex-col gap-0.5 overflow-y-auto p-1"

  if (isFloatingPanelDragging) {
    return <ul className={className}>{children}</ul>
  }

  return (
    <Reorder.Group
      axis="y"
      as="ul"
      className={className}
      onReorder={onReorder}
      values={values}
    >
      {children}
    </Reorder.Group>
  )
}

const LayerListItem = memo(function LayerListItem({
  asset,
  hasMissingAsset,
  isFloatingPanelDragging,
  isSelected,
  layer,
  layerActionKey,
  onLayerAction,
  onRelinkPick,
  onSelectLayer,
  onSetLayerVisibility,
}: LayerListItemProps) {
  const dragControls = useDragControls()

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (layer.locked || isFloatingPanelDragging) {
      return
    }

    dragControls.start(event)
  }

  if (isFloatingPanelDragging) {
    return (
      <li
        className={cn(
          "relative grid min-h-11 grid-cols-[minmax(0,1fr)_28px_28px_28px] items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] border border-transparent px-2 py-[6px] transition-[background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out-cubic)]",
          !layer.locked &&
            "cursor-pointer hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]",
          isSelected &&
            "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
        )}
      >
        <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)]">
          <button
            aria-label={`Reorder ${layer.name}`}
            className={cn(
              "inline-flex h-[14px] w-[14px] touch-none items-center justify-center bg-transparent p-0 text-[var(--ds-color-text-muted)]",
              !layer.locked && "cursor-grab active:cursor-grabbing",
              layer.locked && "text-[var(--ds-color-text-disabled)]"
            )}
            disabled
            type="button"
          >
            <DragHandleDots2Icon height={14} width={14} />
          </button>

          <button
            className="grid min-w-0 cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)] bg-transparent p-0 text-left text-inherit"
            onClick={(event) => onSelectLayer(layer.id, event)}
            type="button"
          >
            <div
              className={getThumbnailClassName(layer, asset)}
              style={
                asset?.kind === "image" || asset?.kind === "video"
                  ? { backgroundImage: `url("${asset.url}")` }
                  : undefined
              }
            />

            <div className="flex min-w-0 flex-col gap-0.5">
              <Typography
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                variant="label"
              >
                {layer.name}
              </Typography>
              <Typography
                className="overflow-hidden text-ellipsis whitespace-nowrap"
                tone="muted"
                variant="monoXs"
              >
                {getLayerSecondaryText(layer, asset)}
              </Typography>
            </div>
          </button>
        </div>

        <Select
          key={`${layer.id}:${layerActionKey}`}
          onValueChange={(value) =>
            onLayerAction(layer.id, value as LayerAction)
          }
          options={LAYER_ACTION_OPTIONS}
          placeholder={<DotsVerticalIcon height={14} width={14} />}
          popupClassName="min-w-[152px]"
          triggerAriaLabel={`Layer actions for ${layer.name}`}
          triggerVariant="icon"
          valueClassName="inline-flex items-center justify-center leading-none text-[var(--ds-color-text-tertiary)] [&_svg]:h-[14px] [&_svg]:w-[14px]"
        />

        {hasMissingAsset ? (
          <IconButton
            aria-label={`Relink missing asset for ${layer.name}`}
            onClick={(event) => {
              event.stopPropagation()
              onRelinkPick(layer)
            }}
            variant="ghost"
          >
            <FileIcon height={14} width={14} />
          </IconButton>
        ) : (
          <IconButton
            aria-label={layer.visible ? "Hide layer" : "Show layer"}
            onClick={(event) => {
              event.stopPropagation()
              onSetLayerVisibility(layer.id, !layer.visible)
            }}
            variant="ghost"
          >
            {layer.visible ? (
              <EyeOpenIcon height={14} width={14} />
            ) : (
              <EyeClosedIcon height={14} width={14} />
            )}
          </IconButton>
        )}

        <IconButton
          aria-label={`Delete ${layer.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onLayerAction(layer.id, "delete")
          }}
          variant="ghost"
        >
          <TrashIcon height={14} width={14} />
        </IconButton>
      </li>
    )
  }

  return (
    <Reorder.Item
      as="li"
      className={cn(
        "relative grid min-h-11 grid-cols-[minmax(0,1fr)_28px_28px_28px] items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] border border-transparent px-2 py-[6px] transition-[background-color,border-color,box-shadow] duration-160 ease-[var(--ease-out-cubic)]",
        !layer.locked &&
          "cursor-pointer hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]",
        isSelected &&
          "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
      )}
      drag={layer.locked || isFloatingPanelDragging ? false : "y"}
      dragControls={dragControls}
      dragListener={false}
      layout="position"
      style={{ zIndex: 0 }}
      value={layer}
    >
      <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)]">
        <button
          aria-label={`Reorder ${layer.name}`}
          className={cn(
            "inline-flex h-[14px] w-[14px] touch-none items-center justify-center bg-transparent p-0 text-[var(--ds-color-text-muted)]",
            !layer.locked && "cursor-grab active:cursor-grabbing",
            layer.locked && "text-[var(--ds-color-text-disabled)]"
          )}
          disabled={layer.locked || isFloatingPanelDragging}
          onPointerDown={handlePointerDown}
          type="button"
        >
          <DragHandleDots2Icon height={14} width={14} />
        </button>

        <button
          className="grid min-w-0 cursor-pointer grid-cols-[28px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)] bg-transparent p-0 text-left text-inherit"
          onClick={(event) => onSelectLayer(layer.id, event)}
          type="button"
        >
          <div
            className={getThumbnailClassName(layer, asset)}
            style={
              asset?.kind === "image" || asset?.kind === "video"
                ? { backgroundImage: `url("${asset.url}")` }
                : undefined
            }
          />

          <div className="flex min-w-0 flex-col gap-0.5">
            <Typography
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              variant="label"
            >
              {layer.name}
            </Typography>
            <Typography
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              tone="muted"
              variant="monoXs"
            >
              {getLayerSecondaryText(layer, asset)}
            </Typography>
          </div>
        </button>
      </div>

      <Select
        key={`${layer.id}:${layerActionKey}`}
        onValueChange={(value) => onLayerAction(layer.id, value as LayerAction)}
        options={LAYER_ACTION_OPTIONS}
        placeholder={<DotsVerticalIcon height={14} width={14} />}
        popupClassName="min-w-[152px]"
        triggerAriaLabel={`Layer actions for ${layer.name}`}
        triggerVariant="icon"
        valueClassName="inline-flex items-center justify-center leading-none text-[var(--ds-color-text-tertiary)] [&_svg]:h-[14px] [&_svg]:w-[14px]"
      />

      {hasMissingAsset ? (
        <IconButton
          aria-label={`Relink missing asset for ${layer.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onRelinkPick(layer)
          }}
          variant="ghost"
        >
          <FileIcon height={14} width={14} />
        </IconButton>
      ) : (
        <IconButton
          aria-label={layer.visible ? "Hide layer" : "Show layer"}
          onClick={(event) => {
            event.stopPropagation()
            onSetLayerVisibility(layer.id, !layer.visible)
          }}
          variant="ghost"
        >
          {layer.visible ? (
            <EyeOpenIcon height={14} width={14} />
          ) : (
            <EyeClosedIcon height={14} width={14} />
          )}
        </IconButton>
      )}

      <IconButton
        aria-label={`Delete ${layer.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onLayerAction(layer.id, "delete")
        }}
        variant="ghost"
      >
        <TrashIcon height={14} width={14} />
      </IconButton>
    </Reorder.Item>
  )
})

export function LayerSidebar() {
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const relinkInputRef = useRef<HTMLInputElement | null>(null)
  const relinkTargetRef = useRef<{
    expectedKind: AssetKind
    layerId: string
  } | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const [layerActionSelectKeys, setLayerActionSelectKeys] = useState<
    Record<string, number>
  >({})
  const [freezeDesktopLayerList, setFreezeDesktopLayerList] = useState(true)

  const layers = useLayerStore((state) => state.layers)
  const hoveredLayerId = useLayerStore((state) => state.hoveredLayerId)
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const addLayer = useLayerStore((state) => state.addLayer)
  const removeLayers = useLayerStore((state) => state.removeLayers)
  const replaceState = useLayerStore((state) => state.replaceState)
  const resetLayerParams = useLayerStore((state) => state.resetLayerParams)
  const selectLayerWithModifiers = useLayerStore(
    (state) => state.selectLayerWithModifiers
  )
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const setLayerRuntimeError = useLayerStore(
    (state) => state.setLayerRuntimeError
  )
  const setLayersVisibility = useLayerStore(
    (state) => state.setLayersVisibility
  )
  const assets = useAssetStore((state) => state.assets)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const removeAsset = useAssetStore((state) => state.removeAsset)
  const leftSidebarVisible = useEditorStore((state) => state.sidebars.left)
  const mobilePanel = useEditorStore((state) => state.mobilePanel)
  const isFloatingPanelDragging = useEditorStore(
    (state) => state.activeFloatingPanelDrag === "layers"
  )
  const floatingPanelsResetToken = useEditorStore(
    (state) => state.floatingPanelsResetToken
  )
  const enterImmersiveCanvas = useEditorStore(
    (state) => state.enterImmersiveCanvas
  )
  const mobilePanelVisible = mobilePanel === "layers"
  const shouldFreezeDesktopLayerList =
    isFloatingPanelDragging || freezeDesktopLayerList

  useEffect(() => {
    let frameOne = 0
    let frameTwo = 0

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        setFreezeDesktopLayerList(false)
      })
    })

    return () => {
      window.cancelAnimationFrame(frameOne)
      window.cancelAnimationFrame(frameTwo)
    }
  }, [])

  useEffect(() => {
    if (floatingPanelsResetToken === 0) {
      return
    }

    setFreezeDesktopLayerList(true)

    const timeout = window.setTimeout(() => {
      setFreezeDesktopLayerList(false)
    }, 320)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [floatingPanelsResetToken])

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  )

  async function handleMediaFile(file: File, layerType: "image" | "video") {
    try {
      const asset = await loadAsset(file)
      const layerId = addLayer(layerType)
      setLayerAsset(layerId, asset.id)
    } catch {
      // No-op.
    }
  }

  function handleImagePick() {
    imageInputRef.current?.click()
  }

  function handleVideoPick() {
    videoInputRef.current?.click()
  }

  function handleAddLayer(action: AddLayerAction) {
    if (action === "image") {
      handleImagePick()
    } else if (action === "video") {
      handleVideoPick()
    } else {
      addLayer(action)
    }
  }

  function handleLayerAction(layerId: string, action: LayerAction) {
    const targetLayerIds = selectedLayerIds.includes(layerId)
      ? selectedLayerIds
      : [layerId]

    if (action === "delete") {
      removeLayers(targetLayerIds)
    } else {
      targetLayerIds.forEach((targetLayerId) => {
        resetLayerParams(targetLayerId)
      })
    }

    setLayerActionSelectKeys((current) => ({
      ...current,
      [layerId]: (current[layerId] ?? 0) + 1,
    }))
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.currentTarget.value = ""

    if (!file) {
      return
    }

    void handleMediaFile(file, "image")
  }

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    event.currentTarget.value = ""

    if (!file) {
      return
    }

    void handleMediaFile(file, "video")
  }

  async function handleRelinkChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const target = relinkTargetRef.current

    event.currentTarget.value = ""
    relinkTargetRef.current = null

    if (!(file && target)) {
      return
    }

    if (inferSelectedFileKind(file) !== target.expectedKind) {
      setLayerRuntimeError(
        target.layerId,
        `Expected a ${target.expectedKind} file.`
      )
      return
    }

    try {
      const asset = await loadAsset(file)

      if (asset.kind !== target.expectedKind) {
        removeAsset(asset.id)
        setLayerRuntimeError(
          target.layerId,
          `Expected a ${target.expectedKind} file.`
        )
        return
      }

      setLayerAsset(target.layerId, asset.id)
    } catch (error) {
      setLayerRuntimeError(
        target.layerId,
        error instanceof Error ? error.message : "Failed to relink asset."
      )
    }
  }

  function handleRelinkPick(layer: EditorLayer) {
    const expectedKind = getExpectedAssetKind(layer)

    if (!expectedKind) {
      return
    }

    relinkTargetRef.current = {
      expectedKind,
      layerId: layer.id,
    }

    if (relinkInputRef.current) {
      relinkInputRef.current.accept = getAcceptForAssetKind(expectedKind)
      relinkInputRef.current.click()
    }
  }

  function handleReorder(nextLayers: EditorLayer[]) {
    replaceState(nextLayers, selectedLayerId, hoveredLayerId, selectedLayerIds)
  }

  function handleSelectLayer(
    layerId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) {
    selectLayerWithModifiers(layerId, {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    })
  }

  function handleSetLayerVisibility(layerId: string, visible: boolean) {
    const targetLayerIds = selectedLayerIds.includes(layerId)
      ? selectedLayerIds
      : [layerId]

    setLayersVisibility(targetLayerIds, visible)
  }

  return (
    <>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageChange}
        ref={imageInputRef}
        type="file"
      />
      <input
        className="hidden"
        onChange={handleRelinkChange}
        ref={relinkInputRef}
        type="file"
      />
      <input
        accept="video/mp4,video/webm,video/quicktime,.mov"
        className="hidden"
        onChange={handleVideoChange}
        ref={videoInputRef}
        type="file"
      />

      <aside
        className={cn(
          "pointer-events-none transition-[opacity,translate] duration-[220ms,260ms] ease-[ease-out,cubic-bezier(0.22,1,0.36,1)]",
          "fixed right-3 bottom-[88px] left-3 z-45 translate-y-0 min-[900px]:hidden",
          !mobilePanelVisible && "translate-y-3 opacity-0"
        )}
      >
        <GlassPanel
          data-layer-sidebar-panel="true"
          className={cn(
            "pointer-events-auto relative flex flex-col gap-[var(--ds-space-1)] p-0 max-h-[min(56vh,420px)] w-full",
            !mobilePanelVisible && "pointer-events-none"
          )}
          variant="panel"
        >
          <div className="flex min-h-11 items-center justify-between border-[var(--ds-border-divider)] border-b pr-3 pl-[var(--ds-space-4)]">
            <Typography
              className="uppercase"
              tone="secondary"
              variant="overline"
            >
              Layers
            </Typography>
            <div className="inline-flex items-center gap-1.5">
              <IconButton
                aria-label="Enter immersive canvas mode"
                className="pointer-events-auto"
                onClick={enterImmersiveCanvas}
                variant="ghost"
              >
                <LayoutIcon height={14} width={14} />
              </IconButton>
              <LayerPicker
                className="pointer-events-auto"
                onSelect={handleAddLayer}
              />
            </div>
          </div>

          <Reorder.Group
            axis="y"
            as="ul"
            className="flex max-h-[min(44vh,320px)] flex-col gap-0.5 overflow-y-auto p-1"
            onReorder={handleReorder}
            values={layers}
          >
            {layers.map((layer) => {
              const asset = layer.assetId
                ? (assetsById.get(layer.assetId) ?? null)
                : null
              const hasMissingAsset = Boolean(layer.assetId && !asset)
              const isSelected = selectedLayerIds.includes(layer.id)

              return (
                <LayerListItem
                  asset={asset}
                  hasMissingAsset={hasMissingAsset}
                  isFloatingPanelDragging={false}
                  isSelected={isSelected}
                  key={layer.id}
                  layer={layer}
                  layerActionKey={layerActionSelectKeys[layer.id] ?? 0}
                  onLayerAction={handleLayerAction}
                  onRelinkPick={handleRelinkPick}
                  onSelectLayer={handleSelectLayer}
                  onSetLayerVisibility={handleSetLayerVisibility}
                />
              )
            })}
          </Reorder.Group>
        </GlassPanel>
      </aside>

      {leftSidebarVisible ? (
        <FloatingDesktopPanel
          id="layers"
          resolvePosition={() => ({
            left: 16,
            top: 76,
          })}
        >
          {({ dragHandleProps, suppressResize: _suppressResize }) => (
            <GlassPanel
              data-layer-sidebar-panel="true"
              className="relative flex w-[284px] flex-col gap-[var(--ds-space-1)] p-0"
              variant="panel"
            >
              <div className="flex min-h-11 items-center justify-between border-[var(--ds-border-divider)] border-b px-3">
                <div className="inline-flex items-center gap-2">
                  <IconButton
                    aria-label="Move layers panel"
                    className="h-7 w-7 cursor-grab text-[var(--ds-color-text-muted)] active:cursor-grabbing"
                    variant="ghost"
                    {...dragHandleProps}
                  >
                    <DragHandleDots2Icon height={14} width={14} />
                  </IconButton>
                  <Typography
                    className="uppercase"
                    tone="secondary"
                    variant="overline"
                  >
                    Layers
                  </Typography>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <IconButton
                    aria-label="Enter immersive canvas mode"
                    className="pointer-events-auto"
                    onClick={enterImmersiveCanvas}
                    variant="ghost"
                  >
                    <LayoutIcon height={14} width={14} />
                  </IconButton>
                  <LayerPicker
                    className="pointer-events-auto"
                    onSelect={handleAddLayer}
                  />
                </div>
              </div>

              <LayerListShell
                isFloatingPanelDragging={shouldFreezeDesktopLayerList}
                onReorder={handleReorder}
                values={layers}
              >
                {layers.map((layer) => {
                  const asset = layer.assetId
                    ? (assetsById.get(layer.assetId) ?? null)
                    : null
                  const hasMissingAsset = Boolean(layer.assetId && !asset)
                  const isSelected = selectedLayerIds.includes(layer.id)

                  return (
                    <LayerListItem
                      asset={asset}
                      hasMissingAsset={hasMissingAsset}
                      isFloatingPanelDragging={shouldFreezeDesktopLayerList}
                      isSelected={isSelected}
                      key={layer.id}
                      layer={layer}
                      layerActionKey={layerActionSelectKeys[layer.id] ?? 0}
                      onLayerAction={handleLayerAction}
                      onRelinkPick={handleRelinkPick}
                      onSelectLayer={handleSelectLayer}
                      onSetLayerVisibility={handleSetLayerVisibility}
                    />
                  )
                })}
              </LayerListShell>
            </GlassPanel>
          )}
        </FloatingDesktopPanel>
      ) : null}
    </>
  )
}
