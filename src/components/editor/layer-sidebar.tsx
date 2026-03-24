"use client"

import {
  Camera,
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
import {
  type ChangeEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  AssetKind,
  EditorAsset,
  EditorLayer,
} from "@/types/editor"
import { cn } from "@/lib/cn"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"

type AddLayerAction =
  | "ascii"
  | "crt"
  | "custom-shader"
  | "dithering"
  | "gradient"
  | "halftone"
  | "image"
  | "live"
  | "particle-grid"
  | "pixel-sorting"
  | "video"
type LayerAction = "delete" | "reset"

const menuButtonClassName = "inline-flex items-center gap-[var(--ds-space-2)]"
const thumbnailBaseClassName =
  "relative h-7 w-7 overflow-hidden rounded-[var(--ds-radius-thumb)] border border-white/6 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.07),rgb(255_255_255_/_0.03))]"

const addLayerOptions = [
  {
    label: (
      <span className={menuButtonClassName}>
        <ImageSquare size={14} weight="regular" />
        Image
      </span>
    ),
    value: "image",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <ImageSquare size={14} weight="regular" />
        Video
      </span>
    ),
    value: "video",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Camera size={14} weight="regular" />
        Live Camera
      </span>
    ),
    value: "live",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Mesh Gradient
      </span>
    ),
    value: "gradient",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Custom Shader
      </span>
    ),
    value: "custom-shader" as const,
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        ASCII
      </span>
    ),
    value: "ascii",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        CRT
      </span>
    ),
    value: "crt",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Dithering
      </span>
    ),
    value: "dithering",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Halftone
      </span>
    ),
    value: "halftone",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Particle Grid
      </span>
    ),
    value: "particle-grid",
  },
  {
    label: (
      <span className={menuButtonClassName}>
        <Sparkle size={14} weight="regular" />
        Pixel Sorting
      </span>
    ),
    value: "pixel-sorting",
  },
] as const satisfies readonly { label: ReactNode; value: AddLayerAction }[]

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

  return layer.type.replaceAll("-", " ")
}

function getThumbnailClassName(
  layer: EditorLayer,
  asset: EditorAsset | null
): string {
  if (asset?.kind === "image" || asset?.kind === "video") {
    return cn(
      thumbnailBaseClassName,
      "bg-cover bg-center"
    )
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
  const relinkTargetRef = useRef<{
    expectedKind: AssetKind
    layerId: string
  } | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const [addLayerSelectKey, setAddLayerSelectKey] = useState(0)
  const [layerActionSelectKeys, setLayerActionSelectKeys] = useState<
    Record<string, number>
  >({})
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
  const setLayerRuntimeError = useLayerStore(
    (state) => state.setLayerRuntimeError
  )
  const setLayerVisibility = useLayerStore((state) => state.setLayerVisibility)
  const assets = useAssetStore((state) => state.assets)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const removeAsset = useAssetStore((state) => state.removeAsset)
  const leftSidebarVisible = useEditorStore((state) => state.sidebars.left)
  const enterImmersiveCanvas = useEditorStore(
    (state) => state.enterImmersiveCanvas
  )

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

  function handleAddDithering() {
    addLayer("dithering")
  }

  function handleAddAscii() {
    addLayer("ascii")
  }

  function handleAddGradient() {
    addLayer("gradient")
  }

  function handleAddCustomShader() {
    addLayer("custom-shader")
  }

  function handleAddLayer(action: AddLayerAction) {
    if (action === "image") {
      handleImagePick()
    } else if (action === "video") {
      handleVideoPick()
    } else if (action === "live") {
      addLayer("live")
    } else if (action === "gradient") {
      handleAddGradient()
    } else if (action === "custom-shader") {
      handleAddCustomShader()
    } else if (action === "ascii") {
      handleAddAscii()
    } else if (action === "crt") {
      addLayer("crt")
    } else if (action === "halftone") {
      addLayer("halftone")
    } else if (action === "particle-grid") {
      addLayer("particle-grid")
    } else if (action === "pixel-sorting") {
      addLayer("pixel-sorting")
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
    <aside
      className={cn(
        "pointer-events-none absolute top-[76px] left-4 z-20 w-[284px] translate-x-0 transition-[opacity,translate] duration-[220ms,260ms] ease-[ease-out,cubic-bezier(0.22,1,0.36,1)]",
        !leftSidebarVisible && "-translate-x-[18px] opacity-0"
      )}
    >
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
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleVideoChange}
        ref={videoInputRef}
        type="file"
      />

      <GlassPanel
        className={cn(
          "pointer-events-auto relative flex flex-col gap-[var(--ds-space-1)] p-0",
          !leftSidebarVisible && "pointer-events-none"
        )}
        variant="panel"
      >
        <div className="flex min-h-11 items-center justify-between border-b border-[var(--ds-border-divider)] pr-3 pl-[var(--ds-space-4)]">
          <Typography className="uppercase" tone="secondary" variant="overline">
            Layers
          </Typography>
          <div className="inline-flex items-center gap-1.5">
            <IconButton
              aria-label="Enter immersive canvas mode"
              className="pointer-events-auto"
              onClick={enterImmersiveCanvas}
              variant="ghost"
            >
              <SidebarSimpleIcon size={14} weight="regular" />
            </IconButton>
            <Select
              key={addLayerSelectKey}
              className="pointer-events-auto"
              onValueChange={(value) => handleAddLayer(value as AddLayerAction)}
              options={addLayerOptions}
              placeholder={<Plus size={14} weight="bold" />}
              popupClassName="min-w-[152px]"
              triggerAriaLabel="Add layer"
              triggerVariant="icon"
              valueClassName="inline-flex items-center justify-center leading-none [&_svg]:h-[14px] [&_svg]:w-[14px]"
            />
          </div>
        </div>

        <ul className="flex max-h-[min(52vh,480px)] flex-col gap-0.5 overflow-y-auto p-1">
          {layers.map((layer) => {
            const asset = layer.assetId
              ? (assetsById.get(layer.assetId) ?? null)
              : null
            const hasMissingAsset = Boolean(layer.assetId && !asset)
            const isSelected = selectedLayerId === layer.id
            const isDragging = draggingLayerId === layer.id
            const isDropTarget =
              dropLayerId === layer.id && draggingLayerId !== layer.id
            const layerActionOptions = [
              { label: "Reset properties", value: "reset" },
              { label: "Delete layer", value: "delete" },
            ] as const satisfies readonly {
              label: ReactNode
              value: LayerAction
            }[]

            return (
              <li
                className={cn(
                  "grid min-h-11 grid-cols-[minmax(0,1fr)_28px_28px] items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-control)] border border-transparent px-2 py-[6px] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out-cubic)]",
                  !layer.locked && "cursor-pointer hover:bg-[var(--ds-color-surface-subtle)] hover:border-[var(--ds-border-subtle)]",
                  isSelected && "bg-[var(--ds-color-surface-active)] border-[var(--ds-border-active)]",
                  isDragging && "opacity-55",
                  isDropTarget && "border-[var(--ds-border-hover)] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.03)]"
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
                <button
                  className="grid min-w-0 grid-cols-[14px_28px_minmax(0,1fr)] items-center gap-[var(--ds-space-2)] bg-transparent p-0 text-left text-inherit"
                  onClick={() => selectLayer(layer.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      "inline-flex h-[14px] w-[14px] items-center justify-center text-[var(--ds-color-text-muted)]",
                      layer.locked && "text-[var(--ds-color-text-disabled)]"
                    )}
                  >
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

                <Select
                  key={`${layer.id}:${layerActionSelectKeys[layer.id] ?? 0}`}
                  onValueChange={(value) =>
                    handleLayerAction(layer.id, value as LayerAction)
                  }
                  options={layerActionOptions}
                  placeholder={
                    <DotsThreeVerticalIcon size={14} weight="bold" />
                  }
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
