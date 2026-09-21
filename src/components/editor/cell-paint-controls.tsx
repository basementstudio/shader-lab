"use client"
import { Typography } from "@/components/ui/typography"
import { PaintBrushControls } from "./paint-brush-controls"

export function CellPaintControls({ layerId }: { layerId: string }) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 py-4">
      <Typography tone="secondary" variant="overline">
        Painted reveal
      </Typography>
      <Typography tone="muted" variant="caption">
        Paint over your subject. Cell Size shapes the stepped edge. The faint
        guide disappears when you finish.
      </Typography>
      <PaintBrushControls
        layerId={layerId}
        target="cells"
        editLabel="Edit Paint"
        doneLabel="Done Painting"
        clearLabel="Clear Paint"
      />
    </section>
  )
}
