"use client"

import { Cross2Icon, PlusIcon } from "@radix-ui/react-icons"
import { useReducedMotion } from "motion/react"
import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { Typography } from "@/components/ui/typography"
import { playOptionalUISound } from "@/lib/audio/shader-lab-sounds"
import { cn } from "@/lib/cn"
import { getAssetAccept, inferFileAssetKind } from "@/lib/editor/media-file"
import { MAX_PATTERN_MOTIFS } from "@/lib/editor/pattern-motifs"
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import type { LayerParameterValues, ParameterValue } from "@/types/editor"

const DRAG_THRESHOLD = 4
const KEY_STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
}
const EMPTY_IDS: string[] = []

type DragState = {
  active: boolean
  from: number
  pointerId: number
  pointerX: number
  pointerY: number
  slots: DOMRect[]
  startX: number
  startY: number
  target: number
}

export function moveMotif(
  ids: readonly string[],
  from: number,
  to: number
): string[] {
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return next
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved)
  return next
}

function nearestSlot(slots: readonly DOMRect[], x: number, y: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [index, slot] of slots.entries()) {
    const dx = slot.left + slot.width / 2 - x
    const dy = slot.top + slot.height / 2 - y
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

function previewIndex(index: number, from: number, target: number): number {
  if (index === from) return target
  if (from < target && index > from && index <= target) return index - 1
  if (target < from && index >= target && index < from) return index + 1
  return index
}

function describeSkipped(skipped: number, failed: number): string | null {
  const parts: string[] = []
  if (skipped > 0) {
    parts.push(
      `${skipped} ${skipped === 1 ? "file was" : "files were"} skipped (limit ${MAX_PATTERN_MOTIFS}, images and SVGs only)`
    )
  }
  if (failed > 0) {
    parts.push(`${failed} could not be read`)
  }
  return parts.length > 0 ? `${parts.join(", ")}.` : null
}

export function PatternMotifControls({
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
  const motifIds = useLayerStore(
    (state) =>
      state.layers.find((layer) => layer.id === layerId)?.patternAssetIds ??
      EMPTY_IDS
  )
  const setLayerPatternAssets = useLayerStore(
    (state) => state.setLayerPatternAssets
  )
  const assets = useAssetStore((state) => state.assets)
  const loadAsset = useAssetStore((state) => state.loadAsset)
  const reduceMotion = useReducedMotion() ?? false
  const inputRef = useRef<HTMLInputElement | null>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [fileHover, setFileHover] = useState(false)
  const [loading, setLoading] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const inverted = values.invert === true
  const room = MAX_PATTERN_MOTIFS - motifIds.length

  const readIds = useCallback(
    () =>
      useLayerStore.getState().layers.find((layer) => layer.id === layerId)
        ?.patternAssetIds ?? EMPTY_IDS,
    [layerId]
  )

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      const images = files.filter((file) => inferFileAssetKind(file) === "image")
      const capacity = Math.max(0, MAX_PATTERN_MOTIFS - readIds().length)
      const accepted = images.slice(0, capacity)
      let failed = 0
      setLoading(accepted.length)
      const loaded: string[] = []
      for (const file of accepted) {
        try {
          const asset = await loadAsset(file, { kind: "image" })
          loaded.push(asset.id)
        } catch {
          failed += 1
        }
      }
      setLoading(0)
      setNotice(describeSkipped(files.length - accepted.length, failed))
      if (loaded.length === 0) return
      const current = readIds()
      setLayerPatternAssets(
        layerId,
        [...current, ...loaded].slice(0, MAX_PATTERN_MOTIFS)
      )
      if (
        current.length === 0 &&
        (values.colorMode === undefined || values.colorMode === "source")
      ) {
        updateLayerParam(layerId, "colorMode", "original")
      }
    },
    [layerId, loadAsset, readIds, setLayerPatternAssets, updateLayerParam, values.colorMode]
  )

  const commit = useCallback(
    (next: string[]) => {
      setNotice(null)
      setLayerPatternAssets(layerId, next)
    },
    [layerId, setLayerPatternAssets]
  )

  const cancelDrag = useCallback(() => {
    setDrag((current) => {
      if (current?.active) {
        onInteractionEnd?.()
      }
      return null
    })
  }, [onInteractionEnd])

  useEffect(() => {
    if (!drag?.active) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("blur", cancelDrag)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", cancelDrag)
    }
  }, [cancelDrag, drag?.active])

  const handlePointerDown = (
    index: number,
    event: PointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const slots = tileRefs.current
      .slice(0, motifIds.length)
      .map((tile) => tile?.getBoundingClientRect() ?? new DOMRect())
    setDrag({
      active: false,
      from: index,
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      slots,
      startX: event.clientX,
      startY: event.clientY,
      target: index,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const moved = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY
    )
    if (!drag.active && moved < DRAG_THRESHOLD) return
    if (!drag.active) {
      onInteractionStart?.()
      playOptionalUISound("generic.dragStart")
    }
    setDrag({
      ...drag,
      active: true,
      pointerX: event.clientX,
      pointerY: event.clientY,
      target: nearestSlot(drag.slots, event.clientX, event.clientY),
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.active) {
      if (drag.target !== drag.from) {
        commit(moveMotif(motifIds, drag.from, drag.target))
      }
      playOptionalUISound("generic.dragEnd")
      onInteractionEnd?.()
    }
    setDrag(null)
  }

  const handleTileKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      commit(motifIds.filter((_, position) => position !== index))
      return
    }
    const step = KEY_STEPS[event.key]
    if (!(event.altKey && step)) return
    event.preventDefault()
    const to = index + step
    if (to < 0 || to >= motifIds.length) return
    commit(moveMotif(motifIds, index, to))
    requestAnimationFrame(() => tileRefs.current[to]?.focus())
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = room > 0 ? "copy" : "none"
    setFileHover(true)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return
    event.preventDefault()
    event.stopPropagation()
    setFileHover(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  const tileTransform = (index: number): string | undefined => {
    if (!drag?.active) return undefined
    if (index === drag.from) {
      const dx = drag.pointerX - drag.startX
      const dy = drag.pointerY - drag.startY
      return reduceMotion
        ? `translate(${dx}px, ${dy}px)`
        : `translate(${dx}px, ${dy}px) rotate(-6deg) scale(1.08)`
    }
    const to = previewIndex(index, drag.from, drag.target)
    const origin = drag.slots[index]
    const destination = drag.slots[to]
    if (!(origin && destination) || to === index) return undefined
    return `translate(${destination.left - origin.left}px, ${destination.top - origin.top}px)`
  }

  return (
    <div className="flex flex-col gap-2" data-pattern-motifs="true">
      <div className="flex items-baseline justify-between gap-2">
        <Typography tone="secondary" variant="label">
          Motifs
        </Typography>
        <Typography tone="muted" variant="monoXs">
          {motifIds.length}/{MAX_PATTERN_MOTIFS}
        </Typography>
      </div>

      <section
        aria-label="Pattern motifs, light tones first"
        className={cn(
          "rounded-[calc(var(--ds-radius-control)+4px)] border bg-white/[0.02] p-1.5 transition-[border-color,background-color] duration-150 ease-out",
          fileHover ? "border-white/30 bg-white/[0.05]" : "border-white/8"
        )}
        onDragLeave={() => setFileHover(false)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ul className="m-0 grid list-none grid-cols-5 gap-1.5 p-0">
          {motifIds.map((id, index) => {
            const asset = assets.find((entry) => entry.id === id)
            const dragging = drag?.active === true && drag.from === index
            return (
              <li
                className={cn(
                  "group relative aspect-square",
                  dragging ? "z-10" : "z-0",
                  !(dragging || reduceMotion) &&
                    "transition-transform duration-180 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                )}
                key={id}
                style={{ transform: tileTransform(index) }}
              >
                <button
                  aria-label={`Motif ${index + 1} of ${motifIds.length}${asset ? `: ${asset.fileName}` : ""}. Alt+Arrow keys reorder, Delete removes.`}
                  className={cn(
                    "block h-full w-full cursor-grab touch-none select-none rounded-[6px] border bg-[repeating-conic-gradient(rgb(255_255_255/0.07)_0_25%,transparent_0_50%)] bg-[length:8px_8px] p-0 outline-none focus-visible:border-white/60 active:cursor-grabbing",
                    dragging
                      ? "border-white/40 shadow-[0_8px_18px_rgb(0_0_0/0.45)]"
                      : "border-white/10"
                  )}
                  data-motif-tile={index}
                  onKeyDown={(event) => handleTileKeyDown(index, event)}
                  onLostPointerCapture={() => {
                    if (drag && !drag.active) setDrag(null)
                  }}
                  onPointerCancel={cancelDrag}
                  onPointerDown={(event) => handlePointerDown(index, event)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  ref={(node) => {
                    tileRefs.current[index] = node
                  }}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none block h-full w-full rounded-[5px] bg-contain bg-center bg-no-repeat [background-origin:content-box] p-1"
                    style={
                      asset
                        ? { backgroundImage: `url("${asset.url}")` }
                        : undefined
                    }
                  />
                </button>
                <button
                  aria-label={`Remove motif ${index + 1}`}
                  className="absolute -top-1 -right-1 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-[var(--ds-color-surface-overlay-strong)] p-0 text-white/70 hover:text-white group-focus-within:flex group-hover:flex"
                  data-motif-remove="true"
                  hidden={dragging}
                  onClick={() =>
                    commit(motifIds.filter((_, position) => position !== index))
                  }
                  tabIndex={-1}
                  type="button"
                >
                  <Cross2Icon height={9} width={9} />
                </button>
              </li>
            )
          })}

          {room > 0 ? (
            <li className="aspect-square">
              <button
                aria-label="Add motifs"
                className="flex h-full w-full cursor-pointer items-center justify-center rounded-[6px] border border-dashed border-white/15 bg-transparent p-0 text-white/45 transition-[color,border-color,background-color] duration-150 ease-out hover:border-white/35 hover:bg-white/[0.04] hover:text-white/80 disabled:cursor-progress"
                disabled={loading > 0}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                {loading > 0 ? (
                  <span className="text-[10px] leading-3">{loading}…</span>
                ) : (
                  <PlusIcon height={14} width={14} />
                )}
              </button>
            </li>
          ) : null}
        </ul>
      </section>

      <div className="flex items-center gap-2">
        <Typography tone="muted" variant="caption">
          {inverted ? "Dark" : "Light"}
        </Typography>
        <div
          aria-hidden="true"
          className={cn(
            "h-[3px] flex-1 rounded-full",
            inverted
              ? "bg-[linear-gradient(90deg,rgb(255_255_255/0.08),rgb(255_255_255/0.7))]"
              : "bg-[linear-gradient(90deg,rgb(255_255_255/0.7),rgb(255_255_255/0.08))]"
          )}
        />
        <Typography tone="muted" variant="caption">
          {inverted ? "Light" : "Dark"}
        </Typography>
      </div>

      <Typography tone="muted" variant="caption">
        {motifIds.length === 0
          ? "Add images or SVGs, or drop several at once. Each one takes a band of tones, in order."
          : "Drag to reorder. The first motif fills the lightest tones, the last the darkest."}
      </Typography>

      {notice ? (
        <Typography tone="muted" variant="caption">
          {notice}
        </Typography>
      ) : null}

      <input
        accept={getAssetAccept("image")}
        className="hidden"
        data-testid="pattern-motif-input"
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ""
          void addFiles(files)
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  )
}
