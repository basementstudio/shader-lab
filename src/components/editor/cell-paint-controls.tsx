"use client"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Typography } from "@/components/ui/typography"
import { canPaintCellLayer, useCellPaintStore } from "@/store/cell-paint-store"
import { useLayerStore } from "@/store/layer-store"

export function CellPaintControls({ layerId }: { layerId: string }) {
  const editing = useCellPaintStore((s) => s.layerId === layerId)
  const tool = useCellPaintStore((s) => s.tool)
  const size = useCellPaintStore((s) => s.brushSize)
  const allowed = useLayerStore((s) =>
    canPaintCellLayer(s.layers, layerId, s.selectedLayerId)
  )
  const hasPaint = useLayerStore(
    (s) => !!s.layers.find((l) => l.id === layerId)?.params.paintMask
  )
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 py-4">
      <Typography tone="secondary" variant="overline">
        Painted reveal
      </Typography>
      <Typography tone="muted" variant="caption">
        Paint over your subject. Cell Size shapes the stepped edge. The faint
        guide disappears when you finish.
      </Typography>
      <div className="flex gap-2">
        <Button
          size="compact"
          variant="secondary"
          disabled={!allowed}
          aria-pressed={editing}
          onClick={() =>
            useCellPaintStore.getState().edit(editing ? null : layerId)
          }
        >
          {editing ? "Done Painting" : "Edit Paint"}
        </Button>
        <Button
          size="compact"
          variant="secondary"
          disabled={!(allowed && hasPaint)}
          onClick={() =>
            useLayerStore.getState().updateLayerParam(layerId, "paintMask", "")
          }
        >
          Clear Paint
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
    </section>
  )
}
