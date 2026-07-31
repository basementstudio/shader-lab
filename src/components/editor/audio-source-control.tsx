"use client"

import { Popover } from "@base-ui/react/popover"
import { SpeakerLoudIcon, SpeakerOffIcon, TrashIcon } from "@radix-ui/react-icons"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { AudioSpectrumDisplay } from "@/components/editor/audio-spectrum-display"
import { useBandValueElement } from "@/hooks/use-band-value-element"
import { cn } from "@/lib/cn"
import { MIN_RELEASE_MS } from "@/lib/editor/audio/bands"
import { acquireLiveBandDriver } from "@/lib/editor/audio/live-band-driver"
import { AUDIO_FILE_ACCEPT } from "@/lib/editor/media-file"
import { useAssetStore, useAudioStore, useTimelineStore } from "@/store"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"
import { IconButton } from "@/components/ui/icon-button"
import {
  NumberInput,
  numberInputControlClassName,
} from "@/components/ui/number-input"
import { Slider } from "@/components/ui/slider"
import { Typography } from "@/components/ui/typography"

const BAND_LABELS: Record<AudioBandId, string> = {
  bass: "Bass",
  high: "High",
  level: "Level",
  mid: "Mid",
}

function MusicNoteIcon() {
  return (
    <svg aria-hidden="true" fill="none" height={13} viewBox="0 0 14 14" width={13}>
      <path
        d="M11.5 2.2L5.9 3.5v6.05"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      />
      <path d="M11.5 2.2v5.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <circle cx="4.4" cy="10.3" fill="currentColor" r="1.75" />
      <circle cx="10" cy="7.6" fill="currentColor" r="1.75" />
    </svg>
  )
}

function BandMeter({ bandId }: { bandId: AudioBandId }) {
  const fillRef = useBandValueElement<HTMLDivElement>(bandId, (element, value) => {
    element.style.transform = `scaleX(${value})`
  })

  return (
    <div className="flex items-center gap-2">
      <Typography
        as="span"
        className="w-9 shrink-0"
        tone="secondary"
        variant="caption"
      >
        {BAND_LABELS[bandId]}
      </Typography>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute inset-0 origin-left rounded-full bg-[rgb(182_151_255)]"
          ref={fillRef}
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  )
}

function BandMeters() {
  return (
    <div className="flex flex-col gap-1.5">
      {AUDIO_BAND_IDS.map((bandId) => (
        <BandMeter bandId={bandId} key={bandId} />
      ))}
    </div>
  )
}

function LabeledField({
  children,
  label,
}: {
  children: (id: string) => ReactNode
  label: string
}) {
  const id = useId()

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Typography as="label" htmlFor={id} tone="secondary" variant="label">
        {label}
      </Typography>
      {children(id)}
    </div>
  )
}

function AdvancedBandEditor({ bandId }: { bandId: AudioBandId }) {
  const band = useAudioStore((state) => state.bands[bandId])
  const updateBand = useAudioStore((state) => state.updateBand)
  const isFullBand = bandId === "level"

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--ds-border-divider)] pt-2">
      <Typography as="span" variant="label">
        {BAND_LABELS[bandId]}
      </Typography>

      {isFullBand ? (
        <Typography as="span" tone="muted" variant="caption">
          Full-band loudness — frequency range does not apply.
        </Typography>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <LabeledField label="Low Hz">
            {(id) => (
              <NumberInput
                className={numberInputControlClassName}
                onPointerDown={(event) => {
                  event.currentTarget.focus()
                }}
                id={id}
                max={20000}
                min={1}
                onChange={(value) => {
                  updateBand(bandId, { lowHz: value })
                }}
                step={1}
                value={band.lowHz}
              />
            )}
          </LabeledField>
          <LabeledField label="High Hz">
            {(id) => (
              <NumberInput
                className={numberInputControlClassName}
                onPointerDown={(event) => {
                  event.currentTarget.focus()
                }}
                id={id}
                max={20000}
                min={2}
                onChange={(value) => {
                  updateBand(bandId, { highHz: value })
                }}
                step={1}
                value={band.highHz}
              />
            )}
          </LabeledField>
        </div>
      )}

      <Slider
        label="Gain"
        max={24}
        min={-24}
        onValueChange={(value) => {
          updateBand(bandId, { gainDb: value })
        }}
        step={0.5}
        value={band.gainDb}
        valueSuffix=" dB"
      />
      <Slider
        label="Attack"
        max={500}
        min={0}
        onValueChange={(value) => {
          updateBand(bandId, { attackMs: value })
        }}
        step={1}
        value={band.attackMs}
        valueSuffix=" ms"
      />
      <Slider
        label="Release"
        max={1000}
        min={MIN_RELEASE_MS}
        onValueChange={(value) => {
          updateBand(bandId, { releaseMs: value })
        }}
        step={1}
        value={band.releaseMs}
        valueSuffix=" ms"
      />
    </div>
  )
}

export function AudioSourceControl({
  monitorEnabled,
  onToggleMonitor,
}: {
  monitorEnabled: boolean
  onToggleMonitor: () => void
}) {
  const analysisProgress = useAudioStore((state) => state.analysisProgress)
  const analyze = useAudioStore((state) => state.analyze)
  const clearSource = useAudioStore((state) => state.clearSource)
  const error = useAudioStore((state) => state.error)
  const offsetSeconds = useAudioStore((state) => state.offsetSeconds)
  const setOffsetSeconds = useAudioStore((state) => state.setOffsetSeconds)
  const setSource = useAudioStore((state) => state.setSource)
  const silentBands = useAudioStore((state) => state.envelopes?.silentBands)
  const source = useAudioStore((state) => state.source)
  const status = useAudioStore((state) => state.status)

  const loadAsset = useAssetStore((state) => state.loadAsset)
  const assets = useAssetStore((state) => state.assets)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const levelDotRef = useBandValueElement<HTMLSpanElement>(
    "level",
    (element, value) => {
      element.style.opacity = `${0.35 + 0.65 * value}`
      element.style.transform = `scale(${0.7 + 0.6 * value})`
    }
  )

  useEffect(() => {
    if (status !== "ready") {
      return
    }

    return acquireLiveBandDriver()
  }, [status])

  const sourceAsset =
    source?.kind === "asset"
      ? (assets.find((asset) => asset.id === source.assetId) ?? null)
      : null

  useEffect(() => {
    if (status === "missing-source" && sourceAsset) {
      void analyze(sourceAsset.url)
    }
  }, [analyze, sourceAsset, status])

  const handleFiles = async (files: FileList | null) => {
    const file = files?.item(0)

    if (!file) {
      return
    }

    setLoadError(null)

    try {
      const asset = await loadAsset(file)
      setSource({ assetId: asset.id, kind: "asset" })

      if (asset.duration && asset.duration > 0) {
        useTimelineStore.getState().setDuration(asset.duration)
      }

      await analyze(asset.url)

      const analyzed = useAudioStore.getState().spectrogram

      if (analyzed && !(asset.duration && asset.duration > 0)) {
        useTimelineStore.getState().setDuration(analyzed.durationSeconds)
      }
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? caught.message : "Could not load audio."
      )
    }
  }

  const active = status === "ready"

  const triggerLabel = (() => {
    if (status === "analyzing") {
      return `Analyzing audio, ${Math.round(analysisProgress * 100)}%`
    }
    if (status === "error") {
      return "Audio failed to load"
    }
    if (status === "missing-source") {
      return "Relink project audio"
    }

    return sourceAsset
      ? `Audio settings — ${sourceAsset.fileName}`
      : "Load audio"
  })()

  if (!active && status !== "analyzing") {
    return (
      <div className="inline-flex items-center gap-1">
        <input
          accept={AUDIO_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files)
            event.target.value = ""
          }}
          ref={fileInputRef}
          type="file"
        />
        <IconButton
          aria-label={triggerLabel}
          className={cn(
            "h-7 w-7",
            status === "error" && "text-[rgb(255_138_138)]"
          )}
          onClick={() => fileInputRef.current?.click()}
          variant="default"
        >
          <MusicNoteIcon />
        </IconButton>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Popover.Root modal={false}>
        <Popover.Trigger
          aria-label={triggerLabel}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-[8px] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8 data-[popup-open]:border-[var(--ds-border-hover)] data-[popup-open]:bg-white/8 data-[popup-open]:text-[var(--ds-color-text-primary)]",
            active && "bg-white/12 text-[var(--ds-color-text-primary)]"
          )}
        >
          <MusicNoteIcon />
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
            ref={levelDotRef}
          />
          {status === "analyzing" ? (
            <Typography as="span" tone="secondary" variant="caption">
              {Math.round(analysisProgress * 100)}%
            </Typography>
          ) : null}
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            align="start"
            className="z-50 outline-none"
            side="top"
            sideOffset={10}
          >
            <Popover.Popup className="max-h-[420px] w-[320px] overflow-y-auto rounded-[16px] border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.88)] p-3 shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[28px] transition-[opacity,transform] duration-160 ease-[var(--ease-out-cubic)] data-[closed]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Typography as="span" variant="label">
                    Audio Source
                  </Typography>
                  {source ? (
                    <IconButton
                      aria-label="Remove audio source"
                      className="h-6 w-6"
                      onClick={clearSource}
                      variant="ghost"
                    >
                      <TrashIcon height={12} width={12} />
                    </IconButton>
                  ) : null}
                </div>

                <input
                  accept={AUDIO_FILE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    void handleFiles(event.target.files)
                    event.target.value = ""
                  }}
                  ref={fileInputRef}
                  type="file"
                />

                <button
                  className="inline-flex h-8 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-3 text-[var(--ds-color-text-secondary)] transition-[background-color,border-color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Typography as="span" tone="secondary" variant="caption">
                    {sourceAsset ? "Replace audio file…" : "Load audio file…"}
                  </Typography>
                </button>

                {sourceAsset ? (
                  <Typography as="span" tone="muted" variant="caption">
                    {sourceAsset.fileName}
                    {sourceAsset.duration
                      ? ` · ${sourceAsset.duration.toFixed(1)}s`
                      : ""}
                  </Typography>
                ) : null}

                {loadError ?? error ? (
                  <Typography
                    as="span"
                    className="text-[rgb(255_138_138)]"
                    variant="caption"
                  >
                    {loadError ?? error}
                  </Typography>
                ) : null}

                {status === "ready" ? (
                  <>
                    <AudioSpectrumDisplay />
                    <BandMeters />

                    {silentBands && silentBands.length > 0 ? (
                      <Typography as="span" tone="muted" variant="caption">
                        No energy detected in:{" "}
                        {silentBands
                          .map((bandId) => BAND_LABELS[bandId])
                          .join(", ")}
                      </Typography>
                    ) : null}

                    <LabeledField label="Offset (s)">
                      {(id) => (
                        <NumberInput
                          className={numberInputControlClassName}
                          onPointerDown={(event) => {
                            event.currentTarget.focus()
                          }}
                          id={id}
                          onChange={setOffsetSeconds}
                          step={0.1}
                          value={offsetSeconds}
                        />
                      )}
                    </LabeledField>
                    <Typography as="span" tone="muted" variant="caption">
                      Shifts which part of the track the timeline reads, for
                      working on a section of a long song.
                    </Typography>

                    <button
                      className="flex cursor-pointer items-center justify-between border-t border-[var(--ds-border-divider)] pt-2 text-left"
                      onClick={() => setShowAdvanced((open) => !open)}
                      type="button"
                    >
                      <Typography as="span" tone="secondary" variant="caption">
                        Advanced
                      </Typography>
                      <Typography as="span" tone="muted" variant="caption">
                        {showAdvanced ? "Hide" : "Show"}
                      </Typography>
                    </button>

                    {showAdvanced
                      ? AUDIO_BAND_IDS.map((bandId) => (
                          <AdvancedBandEditor bandId={bandId} key={bandId} />
                        ))
                      : null}
                  </>
                ) : null}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <IconButton
        aria-label={monitorEnabled ? "Mute audio" : "Unmute audio"}
        className={cn(
          "h-7 w-7",
          monitorEnabled && "bg-white/12 text-[var(--ds-color-text-primary)]"
        )}
        disabled={status !== "ready"}
        onClick={onToggleMonitor}
        variant={monitorEnabled ? "active" : "default"}
      >
        {monitorEnabled ? (
          <SpeakerLoudIcon height={13} width={13} />
        ) : (
          <SpeakerOffIcon height={13} width={13} />
        )}
      </IconButton>
    </div>
  )
}
