"use client"

import {
  CaretDownIcon,
  CaretRightIcon,
  DotsVerticalIcon,
  DragHandleDots2Icon,
  EyeClosedIcon,
  EyeOpenIcon,
  FileIcon,
  ImageIcon,
  LayoutIcon,
  ShadowIcon,
  TextIcon,
  TrashIcon,
  TransparencyGridIcon,
} from "@radix-ui/react-icons"
import {
  type ChangeEvent,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { motion } from "motion/react"
import { FloatingDesktopPanel } from "@/components/editor/floating-desktop-panel"
import {
  type AddLayerAction,
  LayerPicker,
} from "@/components/editor/layer-picker"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { HoverTooltip } from "@/components/ui/tooltip"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  getChildLayers,
  getDescendantLayerIds,
  getGroupIdForContextInsertion,
  getInsertIndexForNewLayer,
  isGroupLayer,
} from "@/lib/editor/layer-groups"
import { inferFileAssetKind } from "@/lib/editor/media-file"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import type { AssetKind, EditorAsset, EditorLayer } from "@/types/editor"

type LayerAction = "delete" | "rename" | "reset" | "ungroup"
type DropTarget =
  | { beforeLayerId: string | null; type: "root" }
  | { beforeLayerId: string | null; groupId: string; type: "group" }

const thumbnailBaseClassName =
  "relative size-7 overflow-hidden rounded-[var(--ds-radius-thumb)] border border-white/6"

const NORMAL_LAYER_ACTION_OPTIONS = [
  { label: "Rename layer", value: "rename" },
  { label: "Reset properties", value: "reset" },
  { label: "Delete layer", value: "delete" },
] as const satisfies readonly { label: ReactNode; value: LayerAction }[]

const GROUP_LAYER_ACTION_OPTIONS = [
  { label: "Rename group", value: "rename" },
  { label: "Ungroup", value: "ungroup" },
  { label: "Delete group", value: "delete" },
] as const satisfies readonly { label: ReactNode; value: LayerAction }[]

function LayerThumbnail({
  asset,
  layer,
}: {
  asset: EditorAsset | null
  layer: EditorLayer
}) {
  const hasPreview = asset?.kind === "image" || asset?.kind === "video"
  let PlaceholderIcon = ImageIcon
  if (isGroupLayer(layer)) PlaceholderIcon = FileIcon
  else if (layer.type === "pattern") PlaceholderIcon = TransparencyGridIcon
  else if (layer.type === "gradient") PlaceholderIcon = ShadowIcon
  else if (layer.type === "text") PlaceholderIcon = TextIcon
  return (
    <div
      className={cn(
        thumbnailBaseClassName,
        hasPreview
          ? "bg-center bg-cover"
          : "flex items-center justify-center bg-[var(--ds-color-surface-subtle)] text-[var(--ds-color-text-muted)]"
      )}
      style={hasPreview ? { backgroundImage: `url("${asset.url}")` } : undefined}
    >
      {hasPreview ? null : <PlaceholderIcon aria-hidden="true" height={14} width={14} />}
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

function getAcceptForAssetKind(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
    case "video":
      return "video/mp4,video/webm,video/quicktime,.mov"
    case "model":
      return ".glb,.gltf,.obj,model/gltf-binary,model/gltf+json,model/obj,application/octet-stream"
  }
}

function inferSelectedFileKind(file: File): AssetKind | null {
  return inferFileAssetKind(file)
}

function serializeDropTarget(target: DropTarget): string {
  if (target.type === "root") return `root:${target.beforeLayerId ?? "end"}`
  return `group:${target.groupId}:${target.beforeLayerId ?? "end"}`
}

function DropZone({
  active,
  depth,
  targetKey,
}: {
  active: boolean
  depth: number
  targetKey: string
}) {
  return (
    <div
      className={cn(
        "relative h-2 w-full rounded-full bg-transparent p-0 transition-[background-color] duration-120 ease-out",
        active && "bg-[var(--ds-border-active)]"
      )}
      data-layer-drop-key={targetKey}
      style={{ marginLeft: depth * 14 + 8 }}
    />
  )
}

function RenameInput({
  draftName,
  onChange,
  onCommit,
}: {
  draftName: string
  onChange: (nextValue: string) => void
  onCommit: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <input
      className="min-h-7 w-full appearance-none rounded-[8px] border border-[var(--ds-border-active)] bg-[var(--ds-color-surface-control)] px-2 font-[var(--ds-font-sans)] text-[12px] leading-4 text-[var(--ds-color-text-primary)] outline-none"
      onBlur={onCommit}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.preventDefault()
          onCommit()
        }
      }}
      ref={inputRef}
      spellCheck={false}
      type="text"
      value={draftName}
    />
  )
}

function LayerRow({
  asset,
  depth,
  dragOffsetY,
  draftName,
  groupHasChildren,
  hasMissingAsset,
  insideDropActive,
  insideDropKey,
  isDragging,
  isEditing,
  isFloatingPanelDragging,
  isReorderDragging,
  isSelected,
  layer,
  layerActionKey,
  onAction,
  onCommitRename,
  onHandlePointerDown,
  onRenameChange,
  onRelinkPick,
  onSelectLayer,
  onSetLayerVisibility,
  onStartRename,
  onToggleExpanded,
}: {
  asset: EditorAsset | null
  depth: number
  dragOffsetY: number
  draftName: string
  groupHasChildren: boolean
  hasMissingAsset: boolean
  insideDropActive: boolean
  insideDropKey: string | null
  isDragging: boolean
  isEditing: boolean
  isFloatingPanelDragging: boolean
  isReorderDragging: boolean
  isSelected: boolean
  layer: EditorLayer
  layerActionKey: number
  onAction: (layer: EditorLayer, action: LayerAction) => void
  onCommitRename: () => void
  onHandlePointerDown: (
    layerId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void
  onRenameChange: (nextValue: string) => void
  onRelinkPick: (layer: EditorLayer) => void
  onSelectLayer: (layerId: string, event: ReactMouseEvent<HTMLElement>) => void
  onSetLayerVisibility: (layerId: string, visible: boolean) => void
  onStartRename: (layer: EditorLayer) => void
  onToggleExpanded: (layer: EditorLayer) => void
}) {
  const actionOptions = isGroupLayer(layer)
    ? GROUP_LAYER_ACTION_OPTIONS
    : NORMAL_LAYER_ACTION_OPTIONS

  return (
    <motion.li
      animate={{
        boxShadow: isDragging
          ? "0 14px 34px rgba(0, 0, 0, 0.36)"
          : "0 0 0 rgba(0, 0, 0, 0)",
        scale: isDragging ? 1.01 : 1,
        y: isDragging ? dragOffsetY : 0,
      }}
      className={cn(
        "relative grid min-h-11 grid-cols-[minmax(0,1fr)_28px_28px_28px] items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] border border-transparent px-2 py-[6px] transition-[background-color,border-color,box-shadow,opacity] duration-160 ease-[var(--ease-out-cubic)]",
        !layer.locked &&
          "hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]",
        isSelected &&
          "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]",
        insideDropActive && "border-white/10 bg-white/6",
        isDragging && "pointer-events-none z-20 opacity-70"
      )}
      data-layer-drop-key={insideDropKey ?? undefined}
      data-layer-row-id={layer.id}
      transition={{
        boxShadow: { duration: 0.12 },
        scale: { duration: 0.12 },
        y: isDragging
          ? { duration: 0 }
          : { damping: 34, stiffness: 420, type: "spring" },
      }}
      style={{ marginLeft: depth * 14 }}
    >
      <div className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)]">
        <HoverTooltip
          content="Reorder"
          disabled={isReorderDragging}
          side="right"
        >
          <button
            aria-label={`Reorder ${layer.name}`}
            className={cn(
              "inline-flex h-[14px] w-[14px] items-center justify-center bg-transparent p-0 text-[var(--ds-color-text-muted)]",
              !(layer.locked || isFloatingPanelDragging) &&
                "cursor-grab active:cursor-grabbing",
              (layer.locked || isFloatingPanelDragging) &&
                "text-[var(--ds-color-text-disabled)]"
            )}
            disabled={layer.locked || isFloatingPanelDragging}
            onPointerDown={(event) => onHandlePointerDown(layer.id, event)}
            type="button"
          >
            <DragHandleDots2Icon height={14} width={14} />
          </button>
        </HoverTooltip>

        <div
          className="grid min-w-0 cursor-pointer grid-cols-[16px_28px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)] bg-transparent p-0 text-left text-inherit"
          onClick={(event) => onSelectLayer(layer.id, event)}
          onDoubleClick={() => onStartRename(layer)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onSelectLayer(layer.id, event as unknown as ReactMouseEvent<HTMLElement>)
            }
          }}
          role="button"
          tabIndex={0}
        >
          {isGroupLayer(layer) ? (
            <button
              aria-label={layer.expanded ? "Collapse group" : "Expand group"}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-transparent p-0 text-[var(--ds-color-text-muted)]"
              onClick={(event) => {
                event.stopPropagation()
                onToggleExpanded(layer)
              }}
              type="button"
            >
              {layer.expanded ? (
                <CaretDownIcon height={12} width={12} />
              ) : (
                <CaretRightIcon height={12} width={12} />
              )}
            </button>
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
          <LayerThumbnail asset={asset} layer={layer} />
          <div className="flex min-w-0 min-h-7 items-center">
            {isEditing ? (
              <RenameInput
                draftName={draftName}
                onChange={onRenameChange}
                onCommit={onCommitRename}
              />
            ) : (
              <Typography
                className="overflow-hidden text-ellipsis whitespace-nowrap leading-none"
                variant="label"
              >
                {layer.name}
                {isGroupLayer(layer) && !groupHasChildren ? " (Empty)" : ""}
              </Typography>
            )}
          </div>
        </div>
      </div>

      <Select
        key={`${layer.id}:${layerActionKey}`}
        onValueChange={(value) => onAction(layer, value as LayerAction)}
        options={actionOptions}
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
          tooltip="Toggle visibility"
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
          onAction(layer, "delete")
        }}
        tooltip="Delete layer"
        variant="ghost"
      >
        <TrashIcon height={14} width={14} />
      </IconButton>
    </motion.li>
  )
}

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
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [draftLayerName, setDraftLayerName] = useState("")
  const dragStateRef = useRef<{
    dragging: boolean
    layerId: string
    pointerId: number
    startClientX: number
    startClientY: number
  } | null>(null)
  const draggedLayerIdRef = useRef<string | null>(null)
  const dropTargetKeyRef = useRef<string | null>(null)

  const layers = useLayerStore((state) => state.layers)
  const selectedLayerIds = useLayerStore((state) => state.selectedLayerIds)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const addLayer = useLayerStore((state) => state.addLayer)
  const createGroup = useLayerStore((state) => state.createGroup)
  const moveLayerIntoGroup = useLayerStore((state) => state.moveLayerIntoGroup)
  const moveLayerToRoot = useLayerStore((state) => state.moveLayerToRoot)
  const removeLayers = useLayerStore((state) => state.removeLayers)
  const renameLayer = useLayerStore((state) => state.renameLayer)
  const resetLayerParams = useLayerStore((state) => state.resetLayerParams)
  const selectLayer = useLayerStore((state) => state.selectLayer)
  const selectLayerWithModifiers = useLayerStore(
    (state) => state.selectLayerWithModifiers
  )
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const setLayerExpanded = useLayerStore((state) => state.setLayerExpanded)
  const setLayerRuntimeError = useLayerStore(
    (state) => state.setLayerRuntimeError
  )
  const setLayersVisibility = useLayerStore(
    (state) => state.setLayersVisibility
  )
  const ungroupLayer = useLayerStore((state) => state.ungroupLayer)
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
    if (floatingPanelsResetToken === 0) return
    setFreezeDesktopLayerList(true)
    const timeout = window.setTimeout(() => setFreezeDesktopLayerList(false), 320)
    return () => window.clearTimeout(timeout)
  }, [floatingPanelsResetToken])

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets]
  )
  const layerById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer])),
    [layers]
  )

  function clearDragState() {
    dragStateRef.current = null
    draggedLayerIdRef.current = null
    dropTargetKeyRef.current = null
    setDragOffsetY(0)
    setDraggedLayerId(null)
    setDropTargetKey(null)
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  }

  function setActiveDropTargetKey(nextKey: string | null) {
    dropTargetKeyRef.current = nextKey
    setDropTargetKey(nextKey)
  }

  function getInsertionContext() {
    const parentGroupId = getGroupIdForContextInsertion(layers, selectedLayerId)
    return {
      insertIndex: getInsertIndexForNewLayer(layers, parentGroupId),
      parentGroupId,
    }
  }

  async function handleMediaFile(file: File, layerType: "image" | "video") {
    try {
      const asset = await loadAsset(file)
      const { insertIndex, parentGroupId } = getInsertionContext()
      const layerId = addLayer(layerType, insertIndex, parentGroupId)
      setLayerAsset(layerId, asset.id)
    } catch {
      // No-op.
    }
  }

  function handleAddLayer(action: AddLayerAction) {
    if (action === "image") {
      imageInputRef.current?.click()
      return
    }
    if (action === "video") {
      videoInputRef.current?.click()
      return
    }

    const { insertIndex, parentGroupId } = getInsertionContext()
    addLayer(action, insertIndex, parentGroupId)
  }

  function handleCreateGroup() {
    createGroup(0)
  }

  function handleLayerAction(layer: EditorLayer, action: LayerAction) {
    const targetLayerIds = selectedLayerIds.includes(layer.id)
      ? selectedLayerIds
      : [layer.id]

    if (action === "delete") removeLayers(targetLayerIds)
    else if (action === "rename") {
      setEditingLayerId(layer.id)
      setDraftLayerName(layer.name)
    } else if (action === "ungroup" && isGroupLayer(layer)) {
      ungroupLayer(layer.id)
    } else {
      targetLayerIds.forEach((targetLayerId) => {
        resetLayerParams(targetLayerId)
      })
    }

    setLayerActionSelectKeys((current) => ({
      ...current,
      [layer.id]: (current[layer.id] ?? 0) + 1,
    }))
  }

  function commitRename() {
    if (!editingLayerId) return
    renameLayer(editingLayerId, draftLayerName)
    setEditingLayerId(null)
  }

  function canDrop(target: DropTarget): boolean {
    const activeDraggedLayerId =
      draggedLayerIdRef.current ?? dragStateRef.current?.layerId ?? draggedLayerId
    if (!activeDraggedLayerId) return false
    const draggedLayer = layerById.get(activeDraggedLayerId)
    if (!draggedLayer) return false
    if (target.type === "group" && isGroupLayer(draggedLayer)) return false
    if (target.beforeLayerId === activeDraggedLayerId) return false
    return true
  }

  function handleDrop(target: DropTarget) {
    const activeDraggedLayerId =
      draggedLayerIdRef.current ?? dragStateRef.current?.layerId ?? draggedLayerId

    if (!(activeDraggedLayerId && canDrop(target))) {
      clearDragState()
      return
    }

    if (target.type === "root") {
      moveLayerToRoot(activeDraggedLayerId, target.beforeLayerId)
    } else {
      moveLayerIntoGroup(activeDraggedLayerId, target.groupId, target.beforeLayerId)
    }
    clearDragState()
  }

  const dropTargetMap = useMemo(() => {
    const map = new Map<string, DropTarget>()

    const visit = (parentGroupId: string | null) => {
      const children = getChildLayers(layers, parentGroupId)

      for (const layer of children) {
        const beforeTarget = parentGroupId
          ? ({
              beforeLayerId: layer.id,
              groupId: parentGroupId,
              type: "group",
            } as const)
          : ({ beforeLayerId: layer.id, type: "root" } as const)

        map.set(serializeDropTarget(beforeTarget), beforeTarget)

        if (isGroupLayer(layer)) {
          const groupChildren = getChildLayers(layers, layer.id)
          const insideTarget = {
            beforeLayerId: groupChildren[0]?.id ?? null,
            groupId: layer.id,
            type: "group",
          } as const
          map.set(serializeDropTarget(insideTarget), insideTarget)
          visit(layer.id)
        }
      }

      const endTarget = parentGroupId
        ? ({ beforeLayerId: null, groupId: parentGroupId, type: "group" } as const)
        : ({ beforeLayerId: null, type: "root" } as const)

      map.set(serializeDropTarget(endTarget), endTarget)
    }

    visit(null)

    return map
  }, [layers])

  function getAfterTarget(layer: EditorLayer): DropTarget {
    const parentGroupId = layer.parentGroupId ?? null
    const siblings = getChildLayers(layers, parentGroupId)
    const layerIndex = siblings.findIndex((entry) => entry.id === layer.id)
    const nextSibling = layerIndex >= 0 ? (siblings[layerIndex + 1] ?? null) : null

    return parentGroupId
      ? {
          beforeLayerId: nextSibling?.id ?? null,
          groupId: parentGroupId,
          type: "group",
        }
      : {
          beforeLayerId: nextSibling?.id ?? null,
          type: "root",
        }
  }

  function resolveDropTargetKeyAtPoint(clientX: number, clientY: number): string | null {
    const element = document.elementFromPoint(clientX, clientY)
    const targetElement = element?.closest("[data-layer-drop-key]")
    const nextKey = targetElement?.getAttribute("data-layer-drop-key")

    if (nextKey) {
      const nextTarget = dropTargetMap.get(nextKey)
      if (nextTarget && canDrop(nextTarget)) {
        return nextKey
      }
    }

    const rowElement = element?.closest("[data-layer-row-id]")
    const rowLayerId = rowElement?.getAttribute("data-layer-row-id")
    if (!(rowElement && rowLayerId)) {
      return null
    }

    const rowLayer = layerById.get(rowLayerId)
    if (!rowLayer) {
      return null
    }

    const rowBounds = rowElement.getBoundingClientRect()
    const rowMidpoint = rowBounds.top + rowBounds.height / 2
    let inferredTarget: DropTarget

    if (isGroupLayer(rowLayer) && clientY >= rowMidpoint) {
      const groupChildren = getChildLayers(layers, rowLayer.id)
      inferredTarget = {
        beforeLayerId: groupChildren[0]?.id ?? null,
        groupId: rowLayer.id,
        type: "group",
      }
    } else if (clientY < rowMidpoint) {
      inferredTarget = rowLayer.parentGroupId
        ? {
            beforeLayerId: rowLayer.id,
            groupId: rowLayer.parentGroupId,
            type: "group",
          }
        : {
            beforeLayerId: rowLayer.id,
            type: "root",
          }
    } else {
      inferredTarget = getAfterTarget(rowLayer)
    }

    return canDrop(inferredTarget)
      ? serializeDropTarget(inferredTarget)
      : null
  }

  function handleHandlePointerDown(
    layerId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (
      event.button !== 0 ||
      isFloatingPanelDragging ||
      !layerById.has(layerId)
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    dragStateRef.current = {
      dragging: false,
      layerId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
    draggedLayerIdRef.current = layerId
    setActiveDropTargetKey(null)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentDragState = dragStateRef.current
      if (
        !currentDragState ||
        moveEvent.pointerId !== currentDragState.pointerId
      ) {
        return
      }

      if (!currentDragState.dragging) {
        const deltaX = moveEvent.clientX - currentDragState.startClientX
        const deltaY = moveEvent.clientY - currentDragState.startClientY
        if (Math.hypot(deltaX, deltaY) < 4) {
          return
        }

        currentDragState.dragging = true
        setDraggedLayerId(currentDragState.layerId)
        document.body.style.userSelect = "none"
        document.body.style.cursor = "grabbing"
      }

      if (currentDragState.dragging) {
        setDragOffsetY(moveEvent.clientY - currentDragState.startClientY)
      }

      setActiveDropTargetKey(
        resolveDropTargetKeyAtPoint(moveEvent.clientX, moveEvent.clientY)
      )
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      const currentDragState = dragStateRef.current
      if (
        !currentDragState ||
        upEvent.pointerId !== currentDragState.pointerId
      ) {
        return
      }

      const wasDragging = currentDragState.dragging
      const resolvedKey =
        resolveDropTargetKeyAtPoint(upEvent.clientX, upEvent.clientY) ??
        dropTargetKeyRef.current
      const resolvedTarget = resolvedKey
        ? (dropTargetMap.get(resolvedKey) ?? null)
        : null

      if (wasDragging && resolvedTarget && canDrop(resolvedTarget)) {
        handleDrop(resolvedTarget)
      } else {
        clearDragState()
      }

      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  function handleSelectLayer(
    layerId: string,
    event: ReactMouseEvent<HTMLElement>
  ) {
    selectLayerWithModifiers(layerId, {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    })
  }

  function handleToggleExpanded(layer: EditorLayer) {
    if (!isGroupLayer(layer)) return
    const nextExpanded = !layer.expanded
    if (
      !nextExpanded &&
      selectedLayerId &&
      getDescendantLayerIds(layers, layer.id).includes(selectedLayerId)
    ) {
      selectLayer(layer.id)
    }
    setLayerExpanded(layer.id, nextExpanded)
  }

  function handleSetLayerVisibility(layerId: string, visible: boolean) {
    const targetLayerIds = selectedLayerIds.includes(layerId)
      ? selectedLayerIds
      : [layerId]
    setLayersVisibility(targetLayerIds, visible)
  }

  async function handleRelinkChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const target = relinkTargetRef.current
    event.currentTarget.value = ""
    relinkTargetRef.current = null
    if (!(file && target)) return
    if (inferSelectedFileKind(file) !== target.expectedKind) {
      setLayerRuntimeError(target.layerId, `Expected a ${target.expectedKind} file.`)
      return
    }
    try {
      const asset = await loadAsset(file)
      if (asset.kind !== target.expectedKind) {
        removeAsset(asset.id)
        setLayerRuntimeError(target.layerId, `Expected a ${target.expectedKind} file.`)
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
    if (!expectedKind) return
    relinkTargetRef.current = { expectedKind, layerId: layer.id }
    if (relinkInputRef.current) {
      relinkInputRef.current.accept = getAcceptForAssetKind(expectedKind)
      relinkInputRef.current.click()
    }
  }

  const renderContainer = (parentGroupId: string | null, depth = 0): ReactNode => {
    const children = getChildLayers(layers, parentGroupId)

    return (
      <>
        {children.map((layer) => {
          const asset = layer.assetId ? (assetsById.get(layer.assetId) ?? null) : null
          const hasMissingAsset = Boolean(layer.assetId && !asset)
          const groupChildren = isGroupLayer(layer) ? getChildLayers(layers, layer.id) : []
          const insideTarget = isGroupLayer(layer)
            ? ({
                beforeLayerId: groupChildren[0]?.id ?? null,
                groupId: layer.id,
                type: "group",
              } as const)
            : null
          const beforeTarget = parentGroupId
            ? ({
                beforeLayerId: layer.id,
                groupId: parentGroupId,
                type: "group",
              } as const)
            : ({ beforeLayerId: layer.id, type: "root" } as const)

          return (
            <Fragment key={layer.id}>
              <DropZone
                active={dropTargetKey === serializeDropTarget(beforeTarget)}
                depth={depth}
                targetKey={serializeDropTarget(beforeTarget)}
              />
              <LayerRow
                asset={asset}
                depth={depth}
                dragOffsetY={draggedLayerId === layer.id ? dragOffsetY : 0}
                draftName={editingLayerId === layer.id ? draftLayerName : layer.name}
                groupHasChildren={groupChildren.length > 0}
                hasMissingAsset={hasMissingAsset}
                insideDropActive={Boolean(
                  insideTarget &&
                    dropTargetKey === serializeDropTarget(insideTarget)
                )}
                insideDropKey={
                  insideTarget ? serializeDropTarget(insideTarget) : null
                }
                isDragging={draggedLayerId === layer.id}
                isEditing={editingLayerId === layer.id}
                isFloatingPanelDragging={shouldFreezeDesktopLayerList}
                isReorderDragging={draggedLayerId !== null}
                isSelected={selectedLayerIds.includes(layer.id)}
                layer={layer}
                layerActionKey={layerActionSelectKeys[layer.id] ?? 0}
                onAction={handleLayerAction}
                onCommitRename={commitRename}
                onHandlePointerDown={handleHandlePointerDown}
                onRenameChange={setDraftLayerName}
                onRelinkPick={handleRelinkPick}
                onSelectLayer={handleSelectLayer}
                onSetLayerVisibility={handleSetLayerVisibility}
                onStartRename={(targetLayer) => {
                  setEditingLayerId(targetLayer.id)
                  setDraftLayerName(targetLayer.name)
                }}
                onToggleExpanded={handleToggleExpanded}
              />
              {isGroupLayer(layer) && layer.expanded
                ? renderContainer(layer.id, depth + 1)
                : null}
              {isGroupLayer(layer) && layer.expanded && groupChildren.length > 0 ? (
                <DropZone
                  active={
                    dropTargetKey ===
                    serializeDropTarget({
                      beforeLayerId: null,
                      groupId: layer.id,
                      type: "group",
                    })
                  }
                  depth={depth + 1}
                  targetKey={serializeDropTarget({
                    beforeLayerId: null,
                    groupId: layer.id,
                    type: "group",
                  })}
                />
              ) : null}
            </Fragment>
          )
        })}
        <DropZone
          active={
            dropTargetKey ===
            serializeDropTarget(
              parentGroupId
                ? { beforeLayerId: null, groupId: parentGroupId, type: "group" }
                : { beforeLayerId: null, type: "root" }
            )
          }
          depth={depth}
          targetKey={serializeDropTarget(
            parentGroupId
              ? { beforeLayerId: null, groupId: parentGroupId, type: "group" }
              : { beforeLayerId: null, type: "root" }
          )}
        />
      </>
    )
  }

  const renderLayerTree = () => (
    <ul className="flex max-h-[min(52vh,480px)] flex-col gap-0.5 overflow-y-auto p-1">
      {renderContainer(null)}
    </ul>
  )

  const renderHeaderActions = () => (
    <div className="inline-flex items-center gap-1.5">
      <Button onClick={handleCreateGroup} size="compact" variant="ghost">
        New Group
      </Button>
      <IconButton
        aria-label="Hide UI (Cmd + .)"
        className="pointer-events-auto"
        onClick={enterImmersiveCanvas}
        tooltip="Hide UI (Cmd + .)"
        variant="ghost"
      >
        <LayoutIcon height={14} width={14} />
      </IconButton>
      <LayerPicker className="pointer-events-auto" onSelect={handleAddLayer} />
    </div>
  )

  return (
    <>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ""
          if (file) void handleMediaFile(file, "image")
        }}
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
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ""
          if (file) void handleMediaFile(file, "video")
        }}
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
            <Typography className="uppercase" tone="secondary" variant="overline">
              Layers
            </Typography>
            {renderHeaderActions()}
          </div>
          {renderLayerTree()}
        </GlassPanel>
      </aside>

      {leftSidebarVisible ? (
        <FloatingDesktopPanel
          id="layers"
          resolvePosition={() => ({ left: 16, top: 76 })}
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
                  <Typography className="uppercase" tone="secondary" variant="overline">
                    Layers
                  </Typography>
                </div>
                {renderHeaderActions()}
              </div>
              {renderLayerTree()}
            </GlassPanel>
          )}
        </FloatingDesktopPanel>
      ) : null}
    </>
  )
}
