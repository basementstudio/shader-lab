"use client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Typography } from "@/components/ui/typography"
import {
  canPaintTarget,
  type PaintTarget,
  readPaint,
  useCellPaintStore,
  writePaint,
} from "@/store/cell-paint-store"
import { useLayerStore } from "@/store/layer-store"

export function PaintBrushControls({
  layerId,
  target,
  editLabel,
  doneLabel,
  clearLabel,
}: {
  layerId: string
  target: PaintTarget
  editLabel: string
  doneLabel: string
  clearLabel: string
}) {
  const editing = useCellPaintStore(
    (s) => s.layerId === layerId && s.target === target
  )
  const tool = useCellPaintStore((s) => s.tool)
  const size = useCellPaintStore((s) => s.brushSize)
  const allowed = useLayerStore((s) =>
    canPaintTarget(s.layers, layerId, s.selectedLayerId, target)
  )
  const hasPaint = useLayerStore(
    (s) =>
      readPaint(
        s.layers.find((l) => l.id === layerId),
        target
      ) !== ""
  )
  return (
    <>
      <div className="flex gap-2">
        <Button
          size="compact"
          variant="secondary"
          disabled={!allowed}
          aria-pressed={editing}
          onClick={() =>
            useCellPaintStore.getState().edit(editing ? null : layerId, target)
          }
        >
          {editing ? doneLabel : editLabel}
        </Button>
        <Button
          size="compact"
          variant="secondary"
          disabled={!(allowed && hasPaint)}
          onClick={() => writePaint(layerId, target, "")}
        >
          {clearLabel}
        </Button>
      </div>
      <Select
        aria-label="Paint tool"
        value={tool}
        options={[
          { label: "Reveal", value: "reveal" },
          { label: "Erase", value: "erase" },
        ]}
        onValueChange={(v) => {
          if (v === "reveal" || v === "erase")
            useCellPaintStore.getState().setTool(v)
        }}
      />
      <Slider
        label="Brush Size"
        min={0.02}
        max={0.6}
        step={0.01}
        value={size}
        onValueChange={(v) => useCellPaintStore.getState().setBrushSize(v)}
      />
      {editing && (
        <Typography tone="muted" variant="caption">
          Drag to paint · Space-drag to pan · Esc to finish · Undo restores each
          stroke.
        </Typography>
      )}
      {!allowed && (
        <Typography tone="muted" variant="caption">
          Unlock and show this layer and its group to paint.
        </Typography>
      )}
    </>
  )
}
