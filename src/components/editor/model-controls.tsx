"use client"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import {
  CUSTOM_MODEL_ENVIRONMENT,
  MODEL_ENVIRONMENTS,
} from "@/lib/editor/config/model-options"
import { cn } from "@/lib/cn"
import {
  MODEL_GIZMO_MODES,
  useModelGizmoStore,
} from "@/store/model-gizmo-store"
import type { LayerParameterValues } from "@/types/editor"

function environmentCaption(
  values: LayerParameterValues,
  environmentFileName: string | null
): string {
  if (values.environment === CUSTOM_MODEL_ENVIRONMENT) {
    return environmentFileName
      ? `Lit by ${environmentFileName}.`
      : "Custom is selected but no .hdr is attached, so the Studio lights it."
  }

  const studio =
    MODEL_ENVIRONMENTS.find((entry) => entry.id === values.environment) ??
    MODEL_ENVIRONMENTS[0]
  return `Lit by the ${studio.label} studio. Attach an .hdr to use your own.`
}

export function ModelControls({
  environmentFileName,
  onAttachEnvironment,
  onRemoveEnvironment,
  onReplaceModel,
  values,
}: {
  environmentFileName: string | null
  onAttachEnvironment: () => void
  onRemoveEnvironment: () => void
  onReplaceModel: () => void
  values: LayerParameterValues
}) {
  const mode = useModelGizmoStore((state) => state.mode)
  const setMode = useModelGizmoStore((state) => state.setMode)
  return (
    <section
      className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4 first:border-t-0"
      data-model-section="true"
    >
      <Typography className="uppercase" tone="secondary" variant="overline">
        Model
      </Typography>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-1 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] p-0.5">
          {MODEL_GIZMO_MODES.map((entry) => (
            <button
              aria-pressed={mode === entry.id}
              className={cn(
                "flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] font-[var(--ds-font-sans)] text-[11px] text-[var(--ds-color-text-secondary)] transition-[background-color,color] duration-150 hover:text-[var(--ds-color-text-primary)]",
                mode === entry.id &&
                  "bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
              )}
              key={entry.id}
              onClick={() => setMode(entry.id)}
              type="button"
            >
              {entry.label}
              <span className="font-[var(--ds-font-mono)] text-[9px] text-[var(--ds-color-text-muted)]">
                {entry.key}
              </span>
            </button>
          ))}
        </div>
        <Typography tone="muted" variant="caption">
          Drag the gizmo, or hover the canvas and press G, R or S, then X, Y or Z to lock an axis. Alt with G, R or S clears it. Middle-drag orbits the camera.
        </Typography>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Typography tone="muted" variant="caption">
          Swap in a different .glb and keep this layer's settings.
        </Typography>
        <Button
          onClick={onReplaceModel}
          size="compact"
          uiSound="action.relinkAsset"
          variant="secondary"
        >
          Replace
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Typography tone="secondary" variant="caption">
            Environment
          </Typography>
          <Typography className="truncate" tone="muted" variant="caption">
            {environmentCaption(values, environmentFileName)}
          </Typography>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            onClick={onAttachEnvironment}
            size="compact"
            uiSound="action.relinkAsset"
            variant="secondary"
          >
            {environmentFileName ? "Replace .hdr" : "Attach .hdr"}
          </Button>
          {environmentFileName ? (
            <Button onClick={onRemoveEnvironment} size="compact" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
