"use client"
import { type PointerEvent, useCallback, useEffect, useRef } from "react"
import {
  decodeCellPaintMask,
  encodeCellPaintMask,
  type CellPaintMask,
} from "@/renderer/cell-paint-mask"
import {
  expandCellPaintMask,
  paintCellSegment,
  type PaintPoint,
} from "@/lib/editor/paint/cell-paint-brush"
import {
  canPaintTarget,
  type PaintTarget,
  readPaint,
  useCellPaintStore,
  writePaint,
} from "@/store/cell-paint-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"

type Stroke = {
  pointer: number
  mask: CellPaintMask
  point: PaintPoint
  radius: number
  erase: boolean
  base: string
}
export function CellPaintOverlay({
  panning,
  disabled,
}: {
  panning: boolean
  disabled: boolean
}) {
  const id = useCellPaintStore((s) => s.layerId)
  const target = useCellPaintStore((s) => s.target)
  const allowed = useLayerStore((s) =>
    canPaintTarget(s.layers, id, s.selectedLayerId, target)
  )
  // Unmount the gesture surface on selection, mode, visibility, lock or export changes.
  return id && allowed && !disabled ? (
    <PaintSurface
      key={`${target}:${id}`}
      id={id}
      target={target}
      panning={panning}
    />
  ) : null
}
function PaintSurface({
  id,
  target,
  panning,
}: {
  id: string
  target: PaintTarget
  panning: boolean
}) {
  const brushSize = useCellPaintStore((s) => s.brushSize)
  const tool = useCellPaintStore((s) => s.tool)
  const surface = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const stroke = useRef<Stroke | null>(null)
  const pending = useRef<number | null>(null)
  const finish = useCallback(
    (commit: boolean) => {
      if (pending.current !== null) cancelAnimationFrame(pending.current)
      pending.current = null
      const active = stroke.current
      stroke.current = null
      if (active) {
        const state = useLayerStore.getState()
        const layer = state.layers.find((l) => l.id === id)
        if (
          commit &&
          canPaintTarget(state.layers, id, state.selectedLayerId, target) &&
          readPaint(layer, target) === active.base
        ) {
          writePaint(id, target, encodeCellPaintMask(active.mask))
        }
        if (surface.current?.hasPointerCapture(active.pointer))
          surface.current.releasePointerCapture(active.pointer)
        useEditorStore.getState().endInteractiveEdit()
      }
      useCellPaintStore.getState().setDraft(null)
    },
    [id, target]
  )
  useEffect(() => {
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            '[role="dialog"], [role="menu"], [role="listbox"]'
          )
        )
      ) {
        cancel()
        useCellPaintStore.getState().edit(null)
      }
    }
    const beforeHistory = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z")
        cancel()
    }
    // A project replacement/history change must never receive an old stroke.
    const unsubscribe = useLayerStore.subscribe((s) => {
      if (
        stroke.current &&
        readPaint(
          s.layers.find((l) => l.id === id),
          target
        ) !== stroke.current.base
      )
        cancel()
    })
    const unsubscribeScene = useEditorStore.subscribe((state, previous) => {
      if (state.sceneRevision !== previous.sceneRevision) {
        cancel()
        useCellPaintStore.getState().edit(null)
      }
    })
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", key)
    window.addEventListener("keydown", beforeHistory, true)
    return () => {
      cancel()
      unsubscribe()
      unsubscribeScene()
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", key)
      window.removeEventListener("keydown", beforeHistory, true)
    }
  }, [finish, id, target])
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const shorter = Math.max(1, Math.min(rect.width, rect.height))
    const point = {
      x: (event.clientX - rect.left - rect.width / 2) / shorter,
      y: (event.clientY - rect.top - rect.height / 2) / shorter,
    }
    if (cursor.current) {
      const diameter =
        brushSize *
        Math.min(
          event.currentTarget.clientWidth,
          event.currentTarget.clientHeight
        )
      cursor.current.style.cssText = `display:block;left:${((event.clientX - rect.left) / rect.width) * 100}%;top:${((event.clientY - rect.top) / rect.height) * 100}%;width:${diameter}px;height:${diameter}px`
    }
    return { point, width: rect.width / shorter, height: rect.height / shorter }
  }
  const publish = () => {
    if (pending.current !== null) return
    pending.current = requestAnimationFrame(() => {
      pending.current = null
      if (stroke.current)
        useCellPaintStore
          .getState()
          .setDraft(encodeCellPaintMask(stroke.current.mask))
    })
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const { point } = position(event)
    const active = stroke.current
    if (!active || event.pointerId !== active.pointer) return
    event.stopPropagation()
    paintCellSegment(
      active.mask,
      active.point,
      point,
      active.radius,
      active.erase
    )
    active.point = point
    publish()
  }
  return (
    <div
      ref={surface}
      data-cell-paint-overlay="true"
      data-paint-target={target}
      role="application"
      aria-label={
        target === "mask" ? "Paint layer mask" : "Paint photographic reveal"
      }
      className="absolute inset-0 z-20"
      style={{ touchAction: "none", cursor: panning ? "inherit" : "crosshair" }}
      onPointerDown={(event) => {
        if (panning || event.button !== 0 || !event.isPrimary || stroke.current)
          return
        event.preventDefault()
        event.stopPropagation()
        const { point, width, height } = position(event)
        const base = readPaint(
          useLayerStore.getState().layers.find((l) => l.id === id),
          target
        )
        const mask = expandCellPaintMask(
          decodeCellPaintMask(base),
          width,
          height
        )
        stroke.current = {
          pointer: event.pointerId,
          mask,
          point,
          radius: brushSize / 2,
          erase: tool === "erase",
          base,
        }
        useEditorStore.getState().beginInteractiveEdit()
        event.currentTarget.setPointerCapture(event.pointerId)
        paintCellSegment(mask, point, point, brushSize / 2, tool === "erase")
        publish()
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (event.pointerId === stroke.current?.pointer) {
          move(event)
          finish(true)
        }
      }}
      onPointerCancel={(event) => {
        if (event.pointerId === stroke.current?.pointer) finish(false)
      }}
      onLostPointerCapture={(event) => {
        if (event.pointerId === stroke.current?.pointer) finish(false)
      }}
      onPointerLeave={() => {
        if (cursor.current) cursor.current.style.display = "none"
      }}
    >
      <div
        ref={cursor}
        aria-hidden="true"
        className="pointer-events-none absolute hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_black]"
      />
    </div>
  )
}
