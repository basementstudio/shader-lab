"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { Typography } from "@/components/ui/typography"
import { isSvgMediaSource } from "@/lib/editor/media-file"
import {
  extractSvgColors,
  parseSvgPalette,
  readSvgAspect,
  serializeSvgPalette,
} from "@/renderer/svg-palette"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const SVG_ACCEPT = "image/svg+xml,.svg"
const svgTextCache = new Map<string, Promise<string>>()

function readSvgText(url: string): Promise<string> {
  let pending = svgTextCache.get(url)
  if (!pending) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Unable to read SVG: ${response.status}`)
      return response.text()
    })
    pending.catch(() => svgTextCache.delete(url))
    svgTextCache.set(url, pending)
  }
  return pending
}

function useSvgAsset(layerId: string) {
  const assetId = useLayerStore(
    (state) => state.layers.find((layer) => layer.id === layerId)?.assetId ?? null
  )
  return useAssetStore((state) =>
    assetId ? (state.assets.find((asset) => asset.id === assetId) ?? null) : null
  )
}

function sizeForAspect(size: ParameterValue | undefined, aspect: number): [number, number] {
  const current = Array.isArray(size) ? size : [0.6, 0.6]
  const longSide = Math.max(Number(current[0]) || 0.6, Number(current[1]) || 0.6)
  return aspect >= 1
    ? [longSide, Math.max(0.02, longSide / aspect)]
    : [Math.max(0.02, longSide * aspect), longSide]
}

export function SvgShapeSource({
  layerId,
  values,
  updateLayerParam,
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}) {
  const asset = useSvgAsset(layerId)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const setLayerAsset = useLayerStore((state) => state.setLayerAsset)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasSvg = asset !== null && isSvgMediaSource(asset)

  const handleFile = async (file: File) => {
    setError(null)
    const isSvg =
      file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
    if (!isSvg) {
      setError("Choose an .svg file.")
      return
    }
    try {
      const text = await file.text()
      const loaded = await loadAsset(file, { kind: "image" })
      setLayerAsset(layerId, loaded.id)
      updateLayerParam(layerId, "svgPalette", "")
      updateLayerParam(layerId, "size", sizeForAspect(values.size, readSvgAspect(text)))
    } catch {
      setError("That SVG could not be read.")
    }
  }

  return (
    <div className="flex flex-col gap-2" data-svg-shape-source="true">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Typography tone="secondary" variant="label">
            SVG
          </Typography>
          <Typography className="truncate" tone="muted" variant="caption">
            {hasSvg
              ? asset.fileName
              : "Any logo or icon. Edges stay sharp at any size."}
          </Typography>
        </div>
        <Button
          onClick={() => inputRef.current?.click()}
          size="compact"
          uiSound="action.relinkAsset"
          variant={hasSvg ? "secondary" : "primary"}
        >
          {hasSvg ? "Replace" : "Choose SVG"}
        </Button>
      </div>
      {error ? (
        <Typography tone="muted" variant="caption">
          {error}
        </Typography>
      ) : null}
      <input
        accept={SVG_ACCEPT}
        className="hidden"
        data-testid="svg-shape-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) void handleFile(file)
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  )
}

export function SvgShapePalette({
  layerId,
  values,
  updateLayerParam,
  onInteractionStart,
  onInteractionEnd,
}: {
  layerId: string
  values: LayerParameterValues
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
}) {
  const asset = useSvgAsset(layerId)
  const url = asset && isSvgMediaSource(asset) ? asset.url : null
  const [colors, setColors] = useState<string[]>([])

  useEffect(() => {
    if (!url) {
      setColors([])
      return
    }
    let active = true
    readSvgText(url)
      .then((text) => {
        if (active) setColors(extractSvgColors(text))
      })
      .catch(() => {
        if (active) setColors([])
      })
    return () => {
      active = false
    }
  }, [url])

  if (colors.length === 0) return null
  const palette = parseSvgPalette(values.svgPalette)
  const edited = Object.keys(palette).length > 0

  return (
    <div className="flex flex-col gap-2" data-svg-shape-palette="true">
      <div className="flex items-center justify-between gap-2">
        <Typography tone="secondary" variant="label">
          File colors
        </Typography>
        {edited ? (
          <Button
            onClick={() => updateLayerParam(layerId, "svgPalette", "")}
            size="compact"
            variant="ghost"
          >
            Reset
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        {colors.map((color) => (
          <div className="flex items-center justify-between gap-2" key={color}>
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15"
                style={{ backgroundColor: color }}
              />
              <Typography className="uppercase" tone="muted" variant="monoXs">
                {color}
              </Typography>
            </span>
            <ColorPicker
              onInteractionEnd={onInteractionEnd}
              onInteractionStart={onInteractionStart}
              onValueChange={(next) =>
                updateLayerParam(
                  layerId,
                  "svgPalette",
                  serializeSvgPalette({ ...palette, [color]: next.toLowerCase() })
                )
              }
              value={palette[color] ?? color}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
