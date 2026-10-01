"use client"
import { TrashIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
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
      <div className="flex items-stretch gap-2">
        <Button
          size="compact"
          variant="secondary"
          className="flex-1"
          disabled={!allowed}
          aria-pressed={editing}
          onClick={() =>
            useCellPaintStore.getState().edit(editing ? null : layerId, target)
          }
        >
          {editing ? doneLabel : editLabel}
        </Button>
        <IconButton
          aria-label={clearLabel}
          className="h-auto w-[var(--ds-size-control)] rounded-[var(--ds-radius-control)]"
          disabled={!(allowed && hasPaint)}
          onClick={() => writePaint(layerId, target, "")}
          variant="outline"
        >
          <TrashIcon height={14} width={14} />
        </IconButton>
      </div>
      <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
        <Typography className="min-w-0" tone="secondary" variant="label">
          Tool
        </Typography>
        <Select
          aria-label="Paint tool"
          className="w-[132px]"
          triggerClassName="w-[132px]"
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
      </div>
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
