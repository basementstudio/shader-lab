"use client"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { XYPad } from "@/components/ui/xy-pad"
import { useCellPaintStore } from "@/store/cell-paint-store"
import {
  DEFAULT_LAYER_MASK,
  type LayerKind,
  type LayerMask,
  type LayerMaskScope,
  type LayerMaskShape,
} from "@/types/editor"
import { PaintBrushControls } from "./paint-brush-controls"

export const layerMaskShapeOptions: { label: string; value: LayerMaskShape }[] =
  [
    { label: "None", value: "none" },
    { label: "Linear gradient", value: "linear" },
    { label: "Radial gradient", value: "radial" },
    { label: "Ellipse", value: "ellipse" },
    { label: "Rectangle", value: "rectangle" },
    { label: "Brush", value: "brush" },
  ]

const scopeOptions: { label: string; value: LayerMaskScope }[] = [
  { label: "Limit effect", value: "effect" },
  { label: "Cut content", value: "content" },
]

const GEOMETRIC: LayerMaskShape[] = ["linear", "radial", "ellipse", "rectangle"]

function scopeCaption(inGroup: boolean, scope: LayerMaskScope): string {
  if (!inGroup)
    return "Put this effect in a group to cut content: transparency reveals the layers outside the group."
  if (scope === "content")
    return "Outside the mask the group becomes transparent, revealing layers outside it."
  return "Outside the mask the image below stays untouched."
}

export function LayerMaskSection({
  layerId,
  layerKind,
  inGroup,
  mask,
  setLayerMask,
  onInteractionStart,
  onInteractionEnd,
}: {
  layerId: string
  layerKind: LayerKind | string
  inGroup: boolean
  mask: LayerMask | null | undefined
  setLayerMask: (id: string, updates: Partial<LayerMask>) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
}) {
  const current = mask ?? DEFAULT_LAYER_MASK
  const shape = current.shape
  const isEffect = layerKind === "effect"
  const geometric = GEOMETRIC.includes(shape)
  const row = "grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]"
  const chooseShape = (next: LayerMaskShape) => {
    setLayerMask(layerId, { shape: next })
    const paint = useCellPaintStore.getState()
    if (next === "brush") paint.edit(layerId, "mask")
    else if (paint.layerId === layerId && paint.target === "mask")
      paint.edit(null)
  }
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4"
      data-layer-mask-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Mask
      </Typography>
      <div className={row}>
        <Typography className="min-w-0" tone="secondary" variant="label">
          Shape
        </Typography>
        <Select
          triggerAriaLabel="Mask shape"
          className="w-[132px]"
          triggerClassName="w-[132px]"
          value={shape}
          options={layerMaskShapeOptions}
          onValueChange={(value) => {
            if (value) chooseShape(value as LayerMaskShape)
          }}
        />
      </div>
      {shape !== "none" && (
        <>
          {isEffect ? (
            <>
              <div className={row}>
                <Typography className="min-w-0" tone="secondary" variant="label">
                  Applies to
                </Typography>
                <Select
                  triggerAriaLabel="Mask scope"
                  className="w-[132px]"
                  triggerClassName="w-[132px]"
                  disabled={!inGroup}
                  value={inGroup ? current.scope : "effect"}
                  options={scopeOptions}
                  onValueChange={(value) => {
                    if (value === "effect" || value === "content")
                      setLayerMask(layerId, { scope: value })
                  }}
                />
              </div>
              <Typography tone="muted" variant="caption">
                {scopeCaption(inGroup, current.scope)}
              </Typography>
            </>
          ) : (
            <Typography tone="muted" variant="caption">
              Cuts this layer's content. Lower layers show through outside the
              mask.
            </Typography>
          )}
          <div className="flex items-center gap-4">
            <Toggle
              label="Enabled"
              checked={current.enabled}
              onCheckedChange={(checked) =>
                setLayerMask(layerId, { enabled: checked })
              }
            />
            <Toggle
              label="Invert"
              checked={current.invert}
              onCheckedChange={(checked) =>
                setLayerMask(layerId, { invert: checked })
              }
            />
          </div>
          {geometric && (
            <>
              <XYPad
                label="Center"
                min={-1}
                max={1}
                step={0.005}
                value={[current.center[0], -current.center[1]]}
                onInteractionStart={onInteractionStart}
                onInteractionEnd={onInteractionEnd}
                onValueChange={([x, y]) =>
                  setLayerMask(layerId, { center: [x, -y] })
                }
              />
              <Slider
                label={shape === "linear" ? "Length" : "Width"}
                min={0.01}
                max={3}
                step={0.01}
                value={current.size[0]}
                onInteractionStart={onInteractionStart}
                onValueChange={(v) =>
                  setLayerMask(layerId, { size: [v, current.size[1]] })
                }
                onValueCommitted={() => onInteractionEnd?.()}
              />
              {shape !== "linear" && (
                <Slider
                  label="Height"
                  min={0.01}
                  max={3}
                  step={0.01}
                  value={current.size[1]}
                  onInteractionStart={onInteractionStart}
                  onValueChange={(v) =>
                    setLayerMask(layerId, { size: [current.size[0], v] })
                  }
                  onValueCommitted={() => onInteractionEnd?.()}
                />
              )}
              <Slider
                label="Rotation"
                min={-180}
                max={180}
                step={1}
                value={current.rotation}
                valueSuffix="°"
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setLayerMask(layerId, { rotation: v })}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              {(shape === "ellipse" || shape === "rectangle") && (
                <Slider
                  label="Feather"
                  min={0}
                  max={0.25}
                  step={0.005}
                  value={current.feather}
                  onInteractionStart={onInteractionStart}
                  onValueChange={(v) => setLayerMask(layerId, { feather: v })}
                  onValueCommitted={() => onInteractionEnd?.()}
                />
              )}
              <Typography tone="muted" variant="caption">
                Drag the handles on the canvas to move, resize and rotate.
              </Typography>
            </>
          )}
          {shape === "brush" && (
            <PaintBrushControls
              layerId={layerId}
              target="mask"
              editLabel="Edit Mask"
              doneLabel="Done"
              clearLabel="Clear Mask"
            />
          )}
        </>
      )}
    </section>
  )
}
