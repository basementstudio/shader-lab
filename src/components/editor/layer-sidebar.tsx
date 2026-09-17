"use client"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GroupIcon,
  DotsVerticalIcon,
  DragHandleDots2Icon,
  EyeClosedIcon,
  EyeOpenIcon,
  FileIcon,
  ImageIcon,
  LayoutIcon,
  ShadowIcon,
  TextIcon,
  TransparencyGridIcon,
  TrashIcon,
} from "@radix-ui/react-icons"
import { Reorder, useDragControls, useReducedMotion } from "motion/react"
import Image from "next/image"
import {
  type ChangeEvent,
  memo,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
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
import { HoverTooltip } from "@/components/ui/tooltip"
import { Typography } from "@/components/ui/typography"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { cn } from "@/lib/cn"
import { groupingSelection } from "@/lib/editor/layer-groups"
import { duplicateLayers } from "@/lib/editor/duplicate-layers"
import { getAssetAccept, inferFileAssetKind } from "@/lib/editor/media-file"
import { getSeedableMediaDuration } from "@/lib/editor/timeline-duration"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import type { AssetKind, EditorAsset, EditorLayer } from "@/types/editor"

type LayerAction = "delete" | "duplicate" | "reset" | "ungroup" | "up" | "down"

const thumbnailBaseClassName =
  "relative size-7 overflow-hidden rounded-[var(--ds-radius-thumb)] border border-[var(--ds-border-divider)]"

function LayerThumbnail({
  asset,
  layer,
}: {
  asset: EditorAsset | null
  layer: EditorLayer
}) {
  const previewUrl = asset?.kind === "image" ? asset.url : null
  const isLocalPreview = previewUrl?.startsWith("blob:") ?? false
  let PlaceholderIcon = ImageIcon
  if (layer.type === "pattern") {
    PlaceholderIcon = TransparencyGridIcon
  } else if (layer.type === "gradient") {
    PlaceholderIcon = ShadowIcon
  } else if (layer.type === "text") {
    PlaceholderIcon = TextIcon
  }

  return (
    <div
      className={cn(
        thumbnailBaseClassName,
        previewUrl
          ? "bg-center bg-cover"
          : "flex items-center justify-center bg-[var(--ds-color-surface-subtle)] text-[var(--ds-color-text-muted)]"
      )}
      style={
        isLocalPreview && previewUrl
          ? { backgroundImage: `url("${previewUrl}")` }
          : undefined
      }
    >
      {previewUrl && !isLocalPreview ? (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="28px"
          src={previewUrl}
        />
      ) : null}

      {previewUrl ? null : (
        <PlaceholderIcon aria-hidden="true" height={14} width={14} />
      )}
    </div>
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

function inferSelectedFileKind(file: File): AssetKind | null {
  return inferFileAssetKind(file)
}

type LayerListItemProps = {
  children?: ReactNode
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
  { label: "Duplicate layer", value: "duplicate" },
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
  nested = false,
}: {
  children: ReactNode
  isFloatingPanelDragging: boolean
  onReorder: (nextLayers: EditorLayer[]) => void
  values: EditorLayer[]
  nested?: boolean
}) {
  const className = nested
    ? "ml-2 flex flex-col gap-0.5 border-l border-[var(--ds-border-divider)] pl-1"
    : "flex max-h-[min(44vh,320px)] min-[900px]:max-h-[min(52vh,480px)] flex-col gap-0.5 overflow-y-auto p-1"

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

function focusNameInput(node: HTMLInputElement | null) {
  node?.focus()
  node?.select()
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
  children,
}: LayerListItemProps) {
  const dragControls = useDragControls()
  const reduceMotion = useReducedMotion()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(layer.name)
  const cancelRename = useRef(false)
  const renameLayer = useLayerStore((state) => state.renameLayer)
  const setExpanded = useLayerStore((state) => state.setLayerExpanded)
  const isGroup = layer.kind === "group"

  function startRename() {
    cancelRename.current = false
    setName(layer.name)
    setRenaming(true)
  }

  function finishRename() {
    if (!cancelRename.current) renameLayer(layer.id, name)
    setRenaming(false)
  }

  const options = [
    { label: "Rename", value: "rename" },
    ...(isGroup ? [{ label: "Ungroup", value: "ungroup" }] : []),
    { label: "Move up", value: "up" },
    { label: "Move down", value: "down" },
    ...LAYER_ACTION_OPTIONS,
  ]

  const content = (
    <>
      <div
        className={cn(
          "relative grid min-h-11 grid-cols-[minmax(0,1fr)_28px_28px_28px] items-center gap-1 rounded-[var(--ds-radius-control)] border border-transparent px-1.5 py-[6px]",
          !layer.locked &&
            "hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]",
          isSelected &&
            "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <HoverTooltip
            content="Drag to reorder within this group"
            side="right"
          >
            <button
              aria-label={`Reorder ${layer.name}`}
              className="inline-flex size-4 shrink-0 touch-none items-center justify-center bg-transparent p-0 text-[var(--ds-color-text-muted)] enabled:cursor-grab enabled:active:cursor-grabbing disabled:opacity-40"
              disabled={layer.locked || isFloatingPanelDragging}
              onPointerDown={(event) => {
                event.stopPropagation()
                dragControls.start(event)
              }}
              type="button"
            >
              <DragHandleDots2Icon height={14} width={14} />
            </button>
          </HoverTooltip>
          {isGroup && (
            <button
              aria-label={`${layer.expanded ? "Collapse" : "Expand"} ${layer.name}`}
              aria-expanded={layer.expanded}
              className="inline-flex size-5 shrink-0 items-center justify-center text-[var(--ds-color-text-muted)]"
              onClick={() => setExpanded(layer.id, !layer.expanded)}
              type="button"
            >
              {layer.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </button>
          )}
          {renaming ? (
            <input
              aria-label="Layer name"
              className="min-w-0 w-full rounded border border-[var(--ds-border-active)] bg-[var(--ds-color-surface-subtle)] px-1 py-1 text-xs text-[var(--ds-color-text-primary)] outline-none"
              onBlur={finishRename}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") {
                  event.preventDefault()
                  finishRename()
                }
                if (event.key === "Escape") {
                  cancelRename.current = true
                  setRenaming(false)
                }
              }}
              ref={focusNameInput}
              value={name}
            />
          ) : (
            <button
              aria-pressed={isSelected}
              className="flex min-w-0 flex-1 items-center gap-2 bg-transparent p-0 text-left text-inherit"
              onClick={(event) => onSelectLayer(layer.id, event)}
              onDoubleClick={startRename}
              type="button"
            >
              {!isGroup && <LayerThumbnail asset={asset} layer={layer} />}
              <Typography
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none"
                variant="label"
              >
                {layer.name}
              </Typography>
            </button>
          )}
        </div>
        <Select
          key={`${layer.id}:${layerActionKey}:${renaming}`}
          onValueChange={(value) =>
            value === "rename"
              ? startRename()
              : onLayerAction(layer.id, value as LayerAction)
          }
          options={options}
          placeholder={<DotsVerticalIcon height={14} width={14} />}
          popupClassName="min-w-[152px]"
          triggerAriaLabel={`Layer actions for ${layer.name}`}
          triggerVariant="icon"
          uiSound="none"
          valueClassName="inline-flex items-center justify-center leading-none text-[var(--ds-color-text-tertiary)] [&_svg]:h-[14px] [&_svg]:w-[14px]"
        />
        {hasMissingAsset ? (
          <IconButton
            aria-label={`Relink missing asset for ${layer.name}`}
            onClick={() => onRelinkPick(layer)}
            uiSound="none"
            variant="ghost"
          >
            <FileIcon height={14} width={14} />
          </IconButton>
        ) : (
          <IconButton
            aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
            onClick={() => onSetLayerVisibility(layer.id, !layer.visible)}
            tooltip="Toggle visibility"
            uiSound={
              layer.visible ? "action.visibilityOff" : "action.visibilityOn"
            }
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
          onClick={() => onLayerAction(layer.id, "delete")}
          tooltip={isGroup ? "Delete group and contents" : "Delete layer"}
          uiSound="none"
          variant="ghost"
        >
          <TrashIcon height={14} width={14} />
        </IconButton>
      </div>
      {children}
    </>
  )

  if (isFloatingPanelDragging) return <li>{content}</li>
  return (
    <Reorder.Item
      as="li"
      className="relative"
      drag={layer.locked ? false : "y"}
      dragControls={dragControls}
      dragListener={false}
      layout="position"
      {...(reduceMotion ? { transition: { layout: { duration: 0 } } } : {})}
      style={{ zIndex: 0 }}
      value={layer}
    >
      {content}
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
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const addLayer = useLayerStore((state) => state.addLayer)
  const groupLayers = useLayerStore((state) => state.groupLayers)
  const ungroupLayer = useLayerStore((state) => state.ungroupLayer)
  const reorderSiblings = useLayerStore((state) => state.reorderSiblings)
  const [groupError, setGroupError] = useState<string | null>(null)
  const canGroup =
    !selectedLayerIds.length ||
    groupingSelection(layers, selectedLayerIds).length > 0
  function handleGroup() {
    const id = groupLayers(selectedLayerIds)
    setGroupError(
      id
        ? null
        : "Groups support at most eight levels. Select layers within the same group."
    )
    if (id) playUISound("action.addLayer")
  }
  const removeLayers = useLayerStore((state) => state.removeLayers)
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
  const seedDurationFromMedia = useTimelineStore(
    (state) => state.seedDurationFromMedia
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
      seedDurationFromMedia(getSeedableMediaDuration(asset))
      playUISound("action.addLayer")
    } catch {
      return
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
      playUISound("action.addLayer")
    }
  }

  function handleLayerAction(layerId: string, action: LayerAction) {
    const targetLayerIds = selectedLayerIds.includes(layerId)
      ? selectedLayerIds
      : [layerId]

    if (action === "ungroup") {
      ungroupLayer(layerId)
    } else if (action === "up" || action === "down") {
      const layer = layers.find((entry) => entry.id === layerId)
      if (!layer || layer.locked) return
      const siblings = layers
        .filter(
          (entry) => (entry.parentId ?? null) === (layer.parentId ?? null)
        )
        .map((entry) => entry.id)
      const from = siblings.indexOf(layerId)
      const to = from + (action === "up" ? -1 : 1)
      if (to >= 0 && to < siblings.length) {
        siblings.splice(from, 1)
        siblings.splice(to, 0, layerId)
        reorderSiblings(layer.parentId ?? null, siblings)
      }
    } else if (action === "delete") {
      removeLayers(targetLayerIds)
      playUISound("action.deleteLayer")
    } else if (action === "duplicate") {
      duplicateLayers(targetLayerIds)
    } else {
      targetLayerIds.forEach((targetLayerId) => {
        resetLayerParams(targetLayerId)
      })
      playUISound("action.reset")
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
      seedDurationFromMedia(getSeedableMediaDuration(asset))
      playUISound("action.relinkAsset")
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
      relinkInputRef.current.accept = getAssetAccept(expectedKind)
      relinkInputRef.current.click()
    }
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

  function renderLayerTree(
    parentId: string | null,
    frozen: boolean
  ): ReactNode {
    const siblings = layers.filter(
      (layer) => (layer.parentId ?? null) === parentId
    )
    return (
      <LayerListShell
        nested={parentId !== null}
        isFloatingPanelDragging={frozen}
        onReorder={(next) =>
          reorderSiblings(
            parentId,
            next.map((layer) => layer.id)
          )
        }
        values={siblings}
      >
        {siblings.map((layer) => {
          const asset = layer.assetId
            ? (assetsById.get(layer.assetId) ?? null)
            : null
          return (
            <LayerListItem
              key={layer.id}
              layer={layer}
              asset={asset}
              hasMissingAsset={Boolean(layer.assetId && !asset)}
              isFloatingPanelDragging={frozen}
              isSelected={selectedLayerIds.includes(layer.id)}
              layerActionKey={layerActionSelectKeys[layer.id] ?? 0}
              onLayerAction={handleLayerAction}
              onRelinkPick={handleRelinkPick}
              onSelectLayer={handleSelectLayer}
              onSetLayerVisibility={handleSetLayerVisibility}
            >
              {layer.kind === "group" && layer.expanded
                ? renderLayerTree(layer.id, frozen)
                : null}
            </LayerListItem>
          )
        })}
      </LayerListShell>
    )
  }

  const groupButton = (
    <IconButton
      aria-label={
        selectedLayerIds.length ? "Group selected layers" : "New group"
      }
      disabled={!canGroup}
      onClick={handleGroup}
      tooltip={
        canGroup
          ? "Group layers (⌘G / Ctrl+G)"
          : "Select layers within the same group"
      }
      uiSound="none"
      variant="ghost"
    >
      <GroupIcon height={14} width={14} />
    </IconButton>
  )

  return (
    <>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
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
                aria-label="Hide UI (Cmd + .)"
                className="pointer-events-auto"
                onClick={() => {
                  enterImmersiveCanvas()
                  playUISound("action.hideUI")
                }}
                tooltip="Hide UI (Cmd + .)"
                uiSound="none"
                variant="ghost"
              >
                <LayoutIcon height={14} width={14} />
              </IconButton>
              {groupButton}
              <LayerPicker
                className="pointer-events-auto"
                onSelect={handleAddLayer}
              />
            </div>
          </div>

          {renderLayerTree(null, false)}
          {groupError && (
            <output className="px-3 pb-2 text-xs text-[var(--ds-color-text-muted)]">
              {groupError}
            </output>
          )}
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
                    aria-label="Hide UI (Cmd + .)"
                    className="pointer-events-auto"
                    onClick={() => {
                      enterImmersiveCanvas()
                      playUISound("action.hideUI")
                    }}
                    tooltip="Hide UI (Cmd + .)"
                    uiSound="none"
                    variant="ghost"
                  >
                    <LayoutIcon height={14} width={14} />
                  </IconButton>
                  {groupButton}
                  <LayerPicker
                    className="pointer-events-auto"
                    onSelect={handleAddLayer}
                  />
                </div>
              </div>

              {renderLayerTree(null, shouldFreezeDesktopLayerList)}
              {groupError && (
                <output className="px-3 pb-2 text-xs text-[var(--ds-color-text-muted)]">
                  {groupError}
                </output>
              )}
            </GlassPanel>
          )}
        </FloatingDesktopPanel>
      ) : null}
    </>
  )
}
