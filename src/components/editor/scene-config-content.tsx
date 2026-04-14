"use client"

import { useCallback, useMemo } from "react"
import { ChannelCurves } from "@/components/ui/channel-curves"
import { ColorPicker } from "@/components/ui/color-picker"
import { GradientRamp, type GradientStop } from "@/components/ui/gradient-ramp"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { useEditorStore } from "@/store/editor-store"
import type { CompositionAspect, SceneConfig } from "@/types/editor"
import { COMPOSITION_ASPECTS } from "@/types/editor"

const ASPECT_LABELS: Partial<Record<string, string>> = {
  screen: "Screen",
  custom: "Custom",
}

const aspectOptions = COMPOSITION_ASPECTS.map((aspect) => ({
  label: ASPECT_LABELS[aspect] ?? aspect,
  value: aspect,
}))

const inputClassName =
  "h-7 w-14 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-2 text-center font-[var(--ds-font-mono)] text-[11px] leading-4 text-[var(--ds-color-text-primary)] outline-none focus:border-[var(--ds-border-active)]"

function Section({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4">
      <Typography className="uppercase" tone="secondary" variant="overline">
        {title}
      </Typography>
      <div className="flex flex-col gap-[10px]">{children}</div>
    </section>
  )
}

function Row({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Typography variant="label">{label}</Typography>
      {children}
    </div>
  )
}

export function SceneConfigContent() {
  const sceneConfig = useEditorStore((state) => state.sceneConfig)
  const updateSceneConfig = useEditorStore((state) => state.updateSceneConfig)

  const handleUpdate = useCallback(
    <K extends keyof SceneConfig>(key: K, value: SceneConfig[K]) => {
      updateSceneConfig({ [key]: value })
    },
    [updateSceneConfig]
  )

  // Channel mixer as curves: each curve maps input (x: 0=shadow, 1=highlight)
  // to output intensity (y: 0=none, 1=full). Start/end points control the ramp.
  const channelCurves = useMemo(
    () => [
      {
        color: "#ff4444",
        id: "red",
        label: "Red",
        points: [
          {
            x: 0,
            y:
              sceneConfig.channelMixer.rr === 1 &&
              sceneConfig.channelMixer.rg === 0 &&
              sceneConfig.channelMixer.rb === 0
                ? 0
                : sceneConfig.channelMixer.rb,
          },
          { x: 1, y: sceneConfig.channelMixer.rr },
        ] as [{ x: number; y: number }, { x: number; y: number }],
      },
      {
        color: "#44ff44",
        id: "green",
        label: "Green",
        points: [
          {
            x: 0,
            y:
              sceneConfig.channelMixer.gg === 1 &&
              sceneConfig.channelMixer.gr === 0 &&
              sceneConfig.channelMixer.gb === 0
                ? 0
                : sceneConfig.channelMixer.gb,
          },
          { x: 1, y: sceneConfig.channelMixer.gg },
        ] as [{ x: number; y: number }, { x: number; y: number }],
      },
      {
        color: "#4488ff",
        id: "blue",
        label: "Blue",
        points: [
          {
            x: 0,
            y:
              sceneConfig.channelMixer.bb === 1 &&
              sceneConfig.channelMixer.br === 0 &&
              sceneConfig.channelMixer.bg === 0
                ? 0
                : sceneConfig.channelMixer.br,
          },
          { x: 1, y: sceneConfig.channelMixer.bb },
        ] as [{ x: number; y: number }, { x: number; y: number }],
      },
    ],
    [sceneConfig.channelMixer]
  )

  const handleCurveChange = useCallback(
    (
      curveId: string,
      points: [{ x: number; y: number }, { x: number; y: number }]
    ) => {
      const mixer = { ...sceneConfig.channelMixer }
      if (curveId === "red") {
        mixer.rr = points[1].y
        mixer.rb = points[0].y
      } else if (curveId === "green") {
        mixer.gg = points[1].y
        mixer.gb = points[0].y
      } else if (curveId === "blue") {
        mixer.bb = points[1].y
        mixer.br = points[0].y
      }
      updateSceneConfig({ channelMixer: mixer })
    },
    [sceneConfig.channelMixer, updateSceneConfig]
  )

  const handleColorMapChange = useCallback(
    (stops: GradientStop[]) => {
      updateSceneConfig({ colorMap: { stops } })
    },
    [updateSceneConfig]
  )

  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
        <Typography tone="secondary" variant="overline">
          Scene
        </Typography>
      </div>

      <div className="flex min-h-0 max-h-[min(62vh,620px)] flex-col gap-0 overflow-x-hidden overflow-y-auto">
        {/* Composition */}
        <Section title="Composition">
          <Row label="Aspect">
            <Select
              onValueChange={(value) =>
                handleUpdate("compositionAspect", value as CompositionAspect)
              }
              options={aspectOptions}
              value={sceneConfig.compositionAspect}
            />
          </Row>
          {sceneConfig.compositionAspect === "custom" && (
            <div className="flex items-center justify-end gap-1.5">
              <NumberInput
                className={inputClassName}
                min={1}
                onChange={(value) =>
                  handleUpdate("compositionWidth", Math.round(value))
                }
                parseValue={(value) => {
                  const nextValue = Number.parseInt(value, 10)
                  return Number.isFinite(nextValue) ? nextValue : null
                }}
                step={1}
                value={sceneConfig.compositionWidth}
              />
              <Typography tone="muted" variant="monoXs">
                :
              </Typography>
              <NumberInput
                className={inputClassName}
                min={1}
                onChange={(value) =>
                  handleUpdate("compositionHeight", Math.round(value))
                }
                parseValue={(value) => {
                  const nextValue = Number.parseInt(value, 10)
                  return Number.isFinite(nextValue) ? nextValue : null
                }}
                step={1}
                value={sceneConfig.compositionHeight}
              />
            </div>
          )}
        </Section>

        {/* Background */}
        <Section title="Background">
          <Row label="Color">
            <ColorPicker
              onValueChange={(value) => handleUpdate("backgroundColor", value)}
              value={sceneConfig.backgroundColor}
            />
          </Row>
        </Section>

        {/* Color Adjustments */}
        <Section title="Color Adjustments">
          <Slider
            label="Brightness"
            max={100}
            min={-100}
            onValueChange={(value) => handleUpdate("brightness", value / 100)}
            value={sceneConfig.brightness * 100}
          />
          <Slider
            label="Contrast"
            max={100}
            min={-100}
            onValueChange={(value) => handleUpdate("contrast", value / 100)}
            value={sceneConfig.contrast * 100}
          />
          <Row label="Invert">
            <Toggle
              checked={sceneConfig.invert}
              onCheckedChange={(value) => handleUpdate("invert", value)}
            />
          </Row>
        </Section>

        {/* Channel Mixer */}
        <Section title="Channel Mixer">
          <ChannelCurves
            curves={channelCurves}
            onCurveChange={handleCurveChange}
          />
        </Section>

        {/* Clamp / Remap */}
        <Section title="Clamp / Remap">
          <Slider
            label="Black Point"
            max={100}
            min={0}
            onValueChange={(v) => handleUpdate("clampMin", v / 100)}
            value={sceneConfig.clampMin * 100}
          />
          <Slider
            label="White Point"
            max={100}
            min={0}
            onValueChange={(v) => handleUpdate("clampMax", v / 100)}
            value={sceneConfig.clampMax * 100}
          />
        </Section>

        {/* Quantize */}
        <Section title="Quantize">
          <Slider
            label="Levels"
            max={256}
            min={2}
            onValueChange={(value) =>
              handleUpdate("quantizeLevels", Math.round(value))
            }
            value={sceneConfig.quantizeLevels}
          />
        </Section>

        {/* Color Map */}
        <Section title="Color Map">
          <Row label="Enabled">
            <Toggle
              checked={sceneConfig.colorMap !== null}
              onCheckedChange={(enabled) => {
                if (enabled) {
                  updateSceneConfig({
                    colorMap: {
                      stops: [
                        { position: 0, color: "#000000" },
                        { position: 1, color: "#ffffff" },
                      ],
                    },
                  })
                } else {
                  updateSceneConfig({ colorMap: null })
                }
              }}
            />
          </Row>
          {sceneConfig.colorMap && (
            <GradientRamp
              onChange={handleColorMapChange}
              stops={sceneConfig.colorMap.stops}
            />
          )}
        </Section>
      </div>
    </>
  )
}
