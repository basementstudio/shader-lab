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
import {
  renderFieldLabel,
  type TimelineKeyframeControl,
} from "./properties-sidebar-fields"
import {
  type MaskAnimatableField,
  maskParamKey,
  maskUpdatesFor,
} from "@/lib/editor/mask-animation"
import type { ParameterValue } from "@/types/editor"

export const layerMaskShapeOptions: { label: string; value: LayerMaskShape }[] =
  [
    { label: "None", value: "none" },
    { label: "Linear gradient", value: "linear" },
    { label: "Radial gradient", value: "radial" },
    { label: "Ellipse", value: "ellipse" },
    { label: "Rectangle", value: "rectangle" },
    { label: "Brush", value: "brush" },
    { label: "Depth", value: "depth" },
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
  timelineControl,
  updateLayerParam,
  onInteractionStart,
  onInteractionEnd,
}: {
  layerId: string
  layerKind: LayerKind | string
  inGroup: boolean
  mask: LayerMask | null | undefined
  setLayerMask: (id: string, updates: Partial<LayerMask>) => void
  timelineControl?: (
    key: string,
    value: ParameterValue
  ) => TimelineKeyframeControl | null
  updateLayerParam?: (id: string, key: string, value: ParameterValue) => void
  onInteractionStart?: (() => void) | undefined
  onInteractionEnd?: (() => void) | undefined
}) {
  const current = mask ?? DEFAULT_LAYER_MASK
  const shape = current.shape
  const setField = (field: MaskAnimatableField, value: ParameterValue) => {
    if (updateLayerParam) {
      updateLayerParam(layerId, maskParamKey(field), value)
    } else {
      setLayerMask(layerId, maskUpdatesFor(field, value, current))
    }
  }
  const keyed = (label: string, field: MaskAnimatableField, value: ParameterValue) =>
    timelineControl
      ? renderFieldLabel(label, timelineControl(maskParamKey(field), value))
      : label
  const isEffect = layerKind === "effect"
  const geometric = GEOMETRIC.includes(shape)
  const row = "grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]"
  const chooseShape = (next: LayerMaskShape) => {
    setLayerMask(
      layerId,
      next === "depth" && shape !== "depth"
        ? { shape: next, size: [0.4, 1], feather: 0.05 }
        : { shape: next }
    )
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
                label={keyed("Center", "center", current.center)}
                min={-1}
                max={1}
                step={0.005}
                value={[current.center[0], -current.center[1]]}
                onInteractionStart={onInteractionStart}
                onInteractionEnd={onInteractionEnd}
                onValueChange={([x, y]) => setField("center", [x, -y])}
              />
              <Slider
                label={keyed(shape === "linear" ? "Length" : "Width", "size", current.size)}
                min={0.01}
                max={3}
                step={0.01}
                value={current.size[0]}
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setField("size", [v, current.size[1]])}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              {shape !== "linear" && (
                <Slider
                  label={keyed("Height", "size", current.size)}
                  min={0.01}
                  max={3}
                  step={0.01}
                  value={current.size[1]}
                  onInteractionStart={onInteractionStart}
                  onValueChange={(v) => setField("size", [current.size[0], v])}
                  onValueCommitted={() => onInteractionEnd?.()}
                />
              )}
              <Slider
                label={keyed("Rotation", "rotation", current.rotation)}
                min={-180}
                max={180}
                step={1}
                value={current.rotation}
                valueSuffix="°"
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setField("rotation", v)}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              {(shape === "ellipse" || shape === "rectangle") && (
                <Slider
                  label={keyed("Feather", "feather", current.feather)}
                  min={0}
                  max={0.25}
                  step={0.005}
                  value={current.feather}
                  onInteractionStart={onInteractionStart}
                  onValueChange={(v) => setField("feather", v)}
                  onValueCommitted={() => onInteractionEnd?.()}
                />
              )}
              <Typography tone="muted" variant="caption">
                Drag the handles on the canvas to move, resize and rotate.
              </Typography>
            </>
          )}
          {shape === "depth" && (
            <>
              <Slider
                label={keyed("Near", "near", current.size[0])}
                min={0}
                max={1}
                step={0.01}
                value={current.size[0]}
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setField("near", v)}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              <Slider
                label={keyed("Far", "far", current.size[1])}
                min={0}
                max={1}
                step={0.01}
                value={current.size[1]}
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setField("far", v)}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              <Slider
                label={keyed("Feather", "feather", current.feather)}
                min={0}
                max={0.5}
                step={0.005}
                value={current.feather}
                onInteractionStart={onInteractionStart}
                onValueChange={(v) => setField("feather", v)}
                onValueCommitted={() => onInteractionEnd?.()}
              />
              <Typography tone="muted" variant="caption">
                Keeps the range between Near and Far of the depth map on the
                Image layer below. White is near. Without a depth map the mask
                does nothing.
              </Typography>
            </>
          )}
          {shape === "brush" && (
            <Slider
              label={keyed("Feather", "feather", current.feather)}
              min={0}
              max={0.25}
              step={0.005}
              value={current.feather}
              onInteractionStart={onInteractionStart}
              onValueChange={(v) => setField("feather", v)}
              onValueCommitted={() => onInteractionEnd?.()}
            />
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
