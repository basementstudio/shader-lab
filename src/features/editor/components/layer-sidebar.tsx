"use client"

import {
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  Eye,
  EyeSlash,
  FolderIcon,
  ImageSquare,
  Plus,
  SidebarSimpleIcon,
  Sparkle,
} from "@phosphor-icons/react"
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import type { AssetKind, EditorAsset, EditorLayer } from "@/features/editor/types"
import { cn } from "@/shared/lib/cn"
import { GlassPanel } from "@/shared/ui/glass-panel"
import { IconButton } from "@/shared/ui/icon-button"
import { Select } from "@/shared/ui/select"
import { Typography } from "@/shared/ui/typography"
import { useAssetStore } from "@/store/assetStore"
import { useEditorStore } from "@/store/editorStore"
import { useLayerStore } from "@/store/layerStore"
import s from "./layer-sidebar.module.css"

type AddLayerAction = "ascii" | "dithering" | "gradient" | "image" | "particle-grid" | "video"
type LayerAction = "delete" | "reset"

const addLayerOptions = [
  {
    label: (
      <span className={s.menuButton}>
        <ImageSquare size={14} weight="regular" />
        Image
      </span>
    ),
    value: "image",
  },
  {
    label: (
      <span className={s.menuButton}>
        <ImageSquare size={14} weight="regular" />
        Video
      </span>
    ),
    value: "video",
  },
  {
    label: (
      <span className={s.menuButton}>
        <Sparkle size={14} weight="regular" />
        Mesh Gradient
      </span>
    ),
    value: "gradient",
  },
  {
    label: (
      <span className={s.menuButton}>
        <Sparkle size={14} weight="regular" />
        ASCII
      </span>
    ),
    value: "ascii",
  },
  {
    label: (
      <span className={s.menuButton}>
        <Sparkle size={14} weight="regular" />
        Dithering
      </span>
    ),
    value: "dithering",
  },
  {
    label: (
      <span className={s.menuButton}>
        <Sparkle size={14} weight="regular" />
        Particle Grid
      </span>
    ),
    value: "particle-grid",
  },
] as const satisfies readonly { label: ReactNode; value: AddLayerAction }[]

function getLayerSecondaryText(layer: EditorLayer, asset: EditorAsset | null): string {
  if (layer.runtimeError) {
    return layer.runtimeError
  }

  if (layer.type === "image" || layer.type === "video" || layer.type === "model") {
    return asset?.fileName ?? "No asset selected"
  }

  return layer.type.replaceAll("-", " ")
}

function getThumbnailClassName(layer: EditorLayer, asset: EditorAsset | null): string {
  if (asset?.kind === "image" || asset?.kind === "video") {
    return cn(s.thumbnail, s.thumbnailImage)
  }

  if (layer.type === "model") {
    return cn(s.thumbnail, s.thumbnailModel)
  }

  return cn(s.thumbnail, s.thumbnailEffect)
}

function getExpectedAssetKind(layer: EditorLayer): AssetKind | null {
  if (layer.type === "image" || layer.type === "video" || layer.type === "model") {
    return layer.type
  }

  return null
}

function getAcceptForAssetKind(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "image/png,image/jpeg,image/webp,image/gif"
    case "video":
      return "video/mp4,video/webm"
    case "model":
      return ".glb,.gltf,.obj,model/gltf-binary,model/gltf+json,model/obj,application/octet-stream"
  }
}

function inferSelectedFileKind(file: File): AssetKind | null {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()

  if (mimeType.startsWith("image/")) {
    return "image"
  }

  if (mimeType.startsWith("video/")) {
    return "video"
  }

  if (
    fileName.endsWith(".glb") ||
    fileName.endsWith(".gltf") ||
    fileName.endsWith(".obj") ||
    mimeType === "model/gltf-binary" ||
    mimeType === "model/gltf+json" ||
    mimeType === "model/obj"
  ) {
    return "model"
  }

  return null
}

export function LayerSidebar() {
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const relinkInputRef = useRef<HTMLInputElement | null>(null)
  const relinkTargetRef = useRef<{ expectedKind: AssetKind; layerId: string } | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const [addLayerSelectKey, setAddLayerSelectKey] = useState(0)
  const [layerActionSelectKeys, setLayerActionSelectKeys] = useState<Record<string, number>>({})
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [dropLayerId, setDropLayerId] = useState<string | null>(null)

  const layers = useLayerStore((state) => state.layers)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const addLayer = useLayerStore((state) => state.addLayer)
  const reorderLayers = useLayerStore((state) => state.reorderLayers)
  const removeLayer = useLayerStore((state) => state.removeLayer)
  const resetLayerParams = useLayerStore((state) => state.resetLayerParams)
  const selectLayer = useLayerStore((state) => state.selectLayer)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const setLayerRuntimeError = useLayerStore((state) => state.setLayerRuntimeError)
  const setLayerVisibility = useLayerStore((state) => state.setLayerVisibility)
  const assets = useAssetStore((state) => state.assets)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const removeAsset = useAssetStore((state) => state.removeAsset)
  const leftSidebarVisible = useEditorStore((state) => state.sidebars.left)
  const enterImmersiveCanvas = useEditorStore((state) => state.enterImmersiveCanvas)

  const assetsById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
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

  function handleAddDithering() {
    addLayer("dithering")
  }

  function handleAddAscii() {
    addLayer("ascii")
  }

  function handleAddGradient() {
    addLayer("gradient")
  }

  function handleAddLayer(action: AddLayerAction) {
    if (action === "image") {
      handleImagePick()
    } else if (action === "video") {
      handleVideoPick()
    } else if (action === "gradient") {
      handleAddGradient()
    } else if (action === "ascii") {
      handleAddAscii()
    } else if (action === "particle-grid") {
      addLayer("particle-grid")
    } else {
      handleAddDithering()
    }

    setAddLayerSelectKey((current) => current + 1)
  }

  function handleLayerAction(layerId: string, action: LayerAction) {
    if (action === "delete") {
      removeLayer(layerId)
    } else {
      resetLayerParams(layerId)
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
        error instanceof Error ? error.message : "Failed to relink asset.",
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

  function commitReorder(targetLayerId: string) {
    if (!draggingLayerId || draggingLayerId === targetLayerId) {
      return
    }

    const fromIndex = layers.findIndex((layer) => layer.id === draggingLayerId)
    const toIndex = layers.findIndex((layer) => layer.id === targetLayerId)

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return
    }

    reorderLayers(fromIndex, toIndex)
  }

  return (
    <aside className={cn(s.root, !leftSidebarVisible && s.rootHidden)}>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageChange}
        ref={imageInputRef}
        type="file"
      />
      <input className="hidden" onChange={handleRelinkChange} ref={relinkInputRef} type="file" />
      <input
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleVideoChange}
        ref={videoInputRef}
        type="file"
      />

      <GlassPanel className={s.panel} variant="panel">
        <div className={s.header}>
          <Typography className={s.title} tone="secondary" variant="overline">
            Layers
          </Typography>
          <div className={s.headerActions}>
            <IconButton
              aria-label="Enter immersive canvas mode"
              className={s.immersiveButton}
              onClick={enterImmersiveCanvas}
              variant="ghost"
            >
              <SidebarSimpleIcon size={14} weight="regular" />
            </IconButton>
            <Select
              key={addLayerSelectKey}
              className={s.addLayerSelect ?? ""}
              iconClassName={s.addLayerIcon ?? ""}
              onValueChange={(value) => handleAddLayer(value as AddLayerAction)}
              options={addLayerOptions}
              placeholder={<Plus size={14} weight="bold" />}
              popupClassName={s.addLayerPopup ?? ""}
              triggerAriaLabel="Add layer"
              triggerClassName={s.addLayerTrigger ?? ""}
              valueClassName={s.addLayerValue ?? ""}
            />
          </div>
        </div>

        <ul className={s.scrollArea}>
          {layers.map((layer) => {
            const asset = layer.assetId ? (assetsById.get(layer.assetId) ?? null) : null
            const hasMissingAsset = Boolean(layer.assetId && !asset)
            const isSelected = selectedLayerId === layer.id
            const isDragging = draggingLayerId === layer.id
            const isDropTarget = dropLayerId === layer.id && draggingLayerId !== layer.id
            const layerActionOptions = [
              { label: "Reset properties", value: "reset" },
              { label: "Delete layer", value: "delete" },
            ] as const satisfies readonly { label: ReactNode; value: LayerAction }[]

            return (
              <li
                className={cn(
                  s.row,
                  !layer.locked && s.rowInteractive,
                  isSelected && s.rowSelected,
                  isDragging && s.rowDragging,
                  isDropTarget && s.rowDropTarget,
                )}
                draggable={!layer.locked}
                key={layer.id}
                onDragEnd={() => {
                  setDraggingLayerId(null)
                  setDropLayerId(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggingLayerId && draggingLayerId !== layer.id) {
                    setDropLayerId(layer.id)
                  }
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", layer.id)
                  setDraggingLayerId(layer.id)
                  setDropLayerId(layer.id)
                  selectLayer(layer.id)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  commitReorder(layer.id)
                  setDraggingLayerId(null)
                  setDropLayerId(null)
                }}
              >
                <button className={s.rowButton} onClick={() => selectLayer(layer.id)} type="button">
                  <span className={cn(s.handle, layer.locked && s.handleLocked)}>
                    <DotsSixVerticalIcon size={14} weight="bold" />
                  </span>

                  <div
                    className={getThumbnailClassName(layer, asset)}
                    style={
                      asset?.kind === "image" || asset?.kind === "video"
                        ? { backgroundImage: `url("${asset.url}")` }
                        : undefined
                    }
                  />

                  <div className={s.labelStack}>
                    <Typography className={s.truncate} variant="label">
                      {layer.name}
                    </Typography>
                    <Typography className={s.truncate} tone="muted" variant="monoXs">
                      {getLayerSecondaryText(layer, asset)}
                    </Typography>
                  </div>
                </button>

                <Select
                  key={`${layer.id}:${layerActionSelectKeys[layer.id] ?? 0}`}
                  className={s.rowActionSelect ?? ""}
                  iconClassName={s.rowActionIcon ?? ""}
                  onValueChange={(value) => handleLayerAction(layer.id, value as LayerAction)}
                  options={layerActionOptions}
                  placeholder={<DotsThreeVerticalIcon size={14} weight="bold" />}
                  popupClassName={s.rowActionPopup ?? ""}
                  triggerAriaLabel={`Layer actions for ${layer.name}`}
                  triggerClassName={s.rowActionTrigger ?? ""}
                  valueClassName={s.rowActionValue ?? ""}
                />

                {hasMissingAsset ? (
                  <IconButton
                    aria-label={`Relink missing asset for ${layer.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRelinkPick(layer)
                    }}
                    variant="ghost"
                  >
                    <FolderIcon size={14} weight="regular" />
                  </IconButton>
                ) : (
                  <IconButton
                    aria-label={layer.visible ? "Hide layer" : "Show layer"}
                    onClick={(event) => {
                      event.stopPropagation()
                      setLayerVisibility(layer.id, !layer.visible)
                    }}
                    variant="ghost"
                  >
                    {layer.visible ? (
                      <Eye size={14} weight="regular" />
                    ) : (
                      <EyeSlash size={14} weight="regular" />
                    )}
                  </IconButton>
                )}
              </li>
            )
          })}
        </ul>
      </GlassPanel>
    </aside>
  )
}
