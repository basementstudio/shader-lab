"use client"

import { Popover } from "@base-ui/react/popover"
import { TrashIcon } from "@radix-ui/react-icons"
import { useId } from "react"
import { useBandValueElement } from "@/hooks/use-band-value-element"
import { cn } from "@/lib/cn"
import { findAudioLink } from "@/lib/editor/audio/links"
import { isParameterAudioModulatable } from "@/lib/editor/parameter-schema"
import { useIsMeasuringLayout } from "@/components/editor/properties-sidebar-measure"
import { useAudioStore } from "@/store"
import {
  AUDIO_BAND_IDS,
  type AnimatedPropertyBinding,
  type AudioBandId,
  type ParameterDefinition,
} from "@/types/editor"
import { IconButton } from "@/components/ui/icon-button"
import {
  NumberInput,
  numberInputControlClassName,
} from "@/components/ui/number-input"
import { Typography } from "@/components/ui/typography"

const BAND_LABELS: Record<AudioBandId, string> = {
  bass: "Bass",
  high: "High",
  level: "Level",
  mid: "Mid",
}

export type AudioLinkControl = {
  binding: AnimatedPropertyBinding | null
  definition: ParameterDefinition | null
  layerId: string
}

/** Small level-meter glyph, distinct from the keyframe rhombus. */
function MeterIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 14 14">
      <rect fill="currentColor" height="5" rx="0.7" width="2" x="2" y="6.5" />
      <rect fill="currentColor" height="9" rx="0.7" width="2" x="6" y="2.5" />
      <rect fill="currentColor" height="7" rx="0.7" width="2" x="10" y="4.5" />
    </svg>
  )
}

function resolveDefaultRange(
  definition: ParameterDefinition | null
): { outMax: number; outMin: number } {
  if (!definition) {
    // Layer properties (opacity/hue/saturation) — opacity's range is the useful
    // default and the value is clamped per property anyway.
    return { outMax: 1, outMin: 0 }
  }

  if (definition.type === "boolean") {
    return { outMax: 1, outMin: 0 }
  }

  const min = "min" in definition ? definition.min : undefined
  const max = "max" in definition ? definition.max : undefined

  // Sweep the declared range when there is one; otherwise pick something
  // visible rather than inventing a bound the shader does not have.
  return { outMax: max ?? 1, outMin: min ?? 0 }
}

/**
 * Its own component so the band registration mounts with the popup content
 * rather than with the always-present trigger — a ref that only becomes
 * non-null later would never get registered.
 */
function BandLevelBar({ bandId }: { bandId: AudioBandId }) {
  const ref = useBandValueElement<HTMLSpanElement>(bandId, (element, value) => {
    element.style.transform = `scaleY(${value})`
  })

  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-1 bottom-1 origin-bottom rounded-[2px] bg-[rgb(182_151_255_/_0.35)]"
      ref={ref}
      style={{ height: "28px", transform: "scaleY(0)" }}
    />
  )
}

/** Same footprint as the real button, so measured heights stay identical. */
function AudioLinkPlaceholder() {
  return <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0" />
}

export function AudioLinkButton({
  control,
}: {
  control: AudioLinkControl | null
}) {
  // Cheap enough to run in every measured copy: a single string selector that
  // only changes when analysis state changes.
  const status = useAudioStore((state) => state.status)
  const measuring = useIsMeasuringLayout()

  const binding = control?.binding ?? null

  // Nothing to offer until a track is loaded — keeps the row uncluttered for
  // everyone not using audio.
  if (!(binding && control) || status !== "ready") {
    return null
  }

  if (control.definition && !isParameterAudioModulatable(control.definition)) {
    return null
  }

  // Guards are shared so the placeholder occupies space in exactly the cases
  // the real button does, keeping the measured height correct.
  if (measuring) {
    return <AudioLinkPlaceholder />
  }

  return <AudioLinkTrigger binding={binding} control={control} />
}

function AudioLinkTrigger({
  binding,
  control,
}: {
  binding: AnimatedPropertyBinding
  control: AudioLinkControl
}) {
  const links = useAudioStore((state) => state.links)
  const addLink = useAudioStore((state) => state.addLink)
  const removeLink = useAudioStore((state) => state.removeLink)
  const updateLink = useAudioStore((state) => state.updateLink)
  const fieldIdPrefix = useId()

  const link = findAudioLink(links, control.layerId, binding)
  const isBoolean = control.definition?.type === "boolean"

  // Pulses with the linked band; written straight to the element by the driver.
  const iconRef = useBandValueElement<HTMLSpanElement>(
    link?.band ?? null,
    (element, value) => {
      element.style.opacity = `${0.55 + 0.45 * value}`
    }
  )


  return (
    <Popover.Root modal={false}>
      <Popover.Trigger
        aria-label={
          link
            ? `Edit audio link for ${binding.label}`
            : `Link ${binding.label} to audio`
        }
        className={cn(
          "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] text-[var(--ds-color-text-muted)] transition-[color,background-color] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:text-[var(--ds-color-text-secondary)] data-[popup-open]:bg-white/8 [&_svg]:h-3 [&_svg]:w-3",
          link && "text-[rgb(182_151_255)]"
        )}
        onPointerDown={(event) => {
          // This button sits inside the Slider's label, so let the popover own
          // the gesture rather than letting it reach the slider control.
          event.stopPropagation()
        }}
      >
        <span className="inline-flex" ref={iconRef}>
          <MeterIcon />
        </span>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="z-50 outline-none"
          side="left"
          sideOffset={10}
        >
          <Popover.Popup
            className="w-[248px] rounded-[16px] border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.88)] p-3 shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[28px] transition-[opacity,transform] duration-160 ease-[var(--ease-out-cubic)] data-[closed]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0">
            <div className="flex flex-col gap-3">
              <Typography as="span" variant="label">
                {binding.label} → Audio
              </Typography>

              <div className="grid grid-cols-4 gap-1">
                {AUDIO_BAND_IDS.map((bandId) => {
                  const selected = link?.band === bandId

                  return (
                    <button
                      className={cn(
                        "relative flex h-11 cursor-pointer flex-col items-center justify-end gap-1 overflow-hidden rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-1 pb-1 transition-[border-color,background-color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)]",
                        selected &&
                          "border-[rgb(182_151_255_/_0.6)] bg-[rgb(182_151_255_/_0.14)]"
                      )}
                      key={bandId}
                      onClick={() => {
                        if (link) {
                          updateLink(link.id, { band: bandId })
                          return
                        }

                        addLink({
                          band: bandId,
                          binding,
                          id: crypto.randomUUID(),
                          layerId: control.layerId,
                          ...resolveDefaultRange(control.definition),
                        })
                      }}
                      type="button"
                    >
                      <BandLevelBar bandId={bandId} />
                      <Typography
                        as="span"
                        className="relative"
                        tone={selected ? "primary" : "secondary"}
                        variant="caption"
                      >
                        {BAND_LABELS[bandId]}
                      </Typography>
                    </button>
                  )
                })}
              </div>

              {link ? (
                <>
                  {isBoolean ? (
                    <div className="flex flex-col gap-1">
                      <Typography
                        as="label"
                        htmlFor={`${fieldIdPrefix}-threshold`}
                        tone="secondary"
                        variant="label"
                      >
                        Threshold
                      </Typography>
                      <NumberInput
                        className={numberInputControlClassName}
                        onPointerDown={(event) => {
                          // base-ui suppresses the popup's default pointer behaviour, which also
                          // suppresses native focus-on-click. Focus explicitly so typing and
                          // Backspace go to the field instead of the editor's global shortcuts.
                          event.currentTarget.focus()
                        }}
                        id={`${fieldIdPrefix}-threshold`}
                        max={1}
                        min={0}
                        onChange={(value) => {
                          updateLink(link.id, { threshold: value })
                        }}
                        step={0.05}
                        value={link.threshold ?? 0.5}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Typography
                          as="label"
                          htmlFor={`${fieldIdPrefix}-min`}
                          tone="secondary"
                          variant="label"
                        >
                          At silence
                        </Typography>
                        <NumberInput
                          className={numberInputControlClassName}
                          onPointerDown={(event) => {
                            // base-ui suppresses the popup's default pointer behaviour, which also
                            // suppresses native focus-on-click. Focus explicitly so typing and
                            // Backspace go to the field instead of the editor's global shortcuts.
                            event.currentTarget.focus()
                          }}
                          id={`${fieldIdPrefix}-min`}
                          onChange={(value) => {
                            updateLink(link.id, { outMin: value })
                          }}
                          step={0.01}
                          value={link.outMin}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <Typography
                          as="label"
                          htmlFor={`${fieldIdPrefix}-max`}
                          tone="secondary"
                          variant="label"
                        >
                          At peak
                        </Typography>
                        <NumberInput
                          className={numberInputControlClassName}
                          onPointerDown={(event) => {
                            // base-ui suppresses the popup's default pointer behaviour, which also
                            // suppresses native focus-on-click. Focus explicitly so typing and
                            // Backspace go to the field instead of the editor's global shortcuts.
                            event.currentTarget.focus()
                          }}
                          id={`${fieldIdPrefix}-max`}
                          onChange={(value) => {
                            updateLink(link.id, { outMax: value })
                          }}
                          step={0.01}
                          value={link.outMax}
                        />
                      </div>
                    </div>
                  )}

                  {!isBoolean && (
                    <Typography as="span" tone="muted" variant="caption">
                      Set “at silence” above “at peak” to invert the response.
                    </Typography>
                  )}

                  <div className="flex items-center justify-between gap-2 border-t border-[var(--ds-border-divider)] pt-2">
                    <button
                      className="cursor-pointer text-left"
                      onClick={() => {
                        updateLink(link.id, { enabled: !link.enabled })
                      }}
                      type="button"
                    >
                      <Typography as="span" tone="secondary" variant="caption">
                        {link.enabled ? "Bypass" : "Enable"}
                      </Typography>
                    </button>
                    <IconButton
                      aria-label="Remove audio link"
                      className="h-6 w-6"
                      onClick={() => removeLink(link.id)}
                      variant="ghost"
                    >
                      <TrashIcon height={12} width={12} />
                    </IconButton>
                  </div>
                </>
              ) : (
                <Typography as="span" tone="muted" variant="caption">
                  Pick a band to drive this parameter.
                </Typography>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
