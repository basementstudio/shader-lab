"use client"

import { useCallback } from "react"
import { ChannelMixerMatrix } from "@/components/ui/channel-mixer-matrix"
import { ColorPicker } from "@/components/ui/color-picker"
import { ColorCurvesEditor } from "@/components/ui/color-curves"
import { GradientRamp, type GradientStop } from "@/components/ui/gradient-ramp"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"
import { useEditorStore } from "@/store/editor-store"
import type { CompositionAspect, SceneConfig } from "@/types/editor"
import { COMPOSITION_ASPECTS, DEFAULT_SCENE_CONFIG } from "@/types/editor"

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

const sectionActionClassName =
  "text-[11px] leading-none text-[var(--ds-color-text-muted)] underline decoration-white/24 underline-offset-3 transition-[color,text-decoration-color] duration-160 ease-[var(--ease-out-cubic)] hover:text-[var(--ds-color-text-secondary)] hover:decoration-white/40"

function Section({
  action,
  children,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-[var(--ds-border-divider)] px-4 pt-[14px] pb-4">
      <div className="flex items-center justify-between gap-3">
        <Typography className="uppercase" tone="secondary" variant="overline">
          {title}
        </Typography>
        {action}
      </div>
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

  const handleColorMapChange = useCallback(
    (stops: GradientStop[]) => {
      updateSceneConfig({ colorMap: { stops } })
    },
    [updateSceneConfig]
  )

  return (
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
      <Section
        action={
          <button
            className={sectionActionClassName}
            onClick={() =>
              updateSceneConfig({
                brightness: DEFAULT_SCENE_CONFIG.brightness,
                contrast: DEFAULT_SCENE_CONFIG.contrast,
                exposure: DEFAULT_SCENE_CONFIG.exposure,
                hue: DEFAULT_SCENE_CONFIG.hue,
                invert: DEFAULT_SCENE_CONFIG.invert,
                saturation: DEFAULT_SCENE_CONFIG.saturation,
                vibrance: DEFAULT_SCENE_CONFIG.vibrance,
                temperature: DEFAULT_SCENE_CONFIG.temperature,
                tint: DEFAULT_SCENE_CONFIG.tint,
              })
            }
            type="button"
          >
            Reset
          </button>
        }
        title="Color Adjustments"
      >
        <Slider
          label="Exposure"
          max={400}
          min={-400}
          onValueChange={(value) => handleUpdate("exposure", value / 100)}
          value={sceneConfig.exposure * 100}
        />
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
        <Slider
          label="Saturation"
          max={200}
          min={0}
          onValueChange={(value) => handleUpdate("saturation", value / 100)}
          value={sceneConfig.saturation * 100}
        />
        <Slider
          label="Vibrance"
          max={100}
          min={-100}
          onValueChange={(value) => handleUpdate("vibrance", value / 100)}
          value={sceneConfig.vibrance * 100}
        />
        <Slider
          label="Hue"
          max={180}
          min={-180}
          onValueChange={(value) => handleUpdate("hue", value)}
          value={sceneConfig.hue}
          valueSuffix="deg"
        />
        <Slider
          label="Temperature"
          max={100}
          min={-100}
          onValueChange={(value) => handleUpdate("temperature", value / 100)}
          value={sceneConfig.temperature * 100}
        />
        <Slider
          label="Tint"
          max={100}
          min={-100}
          onValueChange={(value) => handleUpdate("tint", value / 100)}
          value={sceneConfig.tint * 100}
        />
        <Row label="Invert">
          <Toggle
            checked={sceneConfig.invert}
            onCheckedChange={(value) => handleUpdate("invert", value)}
          />
        </Row>
      </Section>

      {/* Output Mix */}
      <Section title="Output Mix">
        <ChannelMixerMatrix
          onChange={(value) => handleUpdate("channelMixer", value)}
          value={sceneConfig.channelMixer}
        />
      </Section>

      {/* Curves */}
      <Section title="Curves">
        <ColorCurvesEditor
          onChange={(value) => handleUpdate("colorCurves", value)}
          value={sceneConfig.colorCurves}
        />
      </Section>

      {/* Levels */}
      <Section
        action={
          <button
            className={sectionActionClassName}
            onClick={() =>
              updateSceneConfig({
                clampGamma: DEFAULT_SCENE_CONFIG.clampGamma,
                clampMax: DEFAULT_SCENE_CONFIG.clampMax,
                clampMin: DEFAULT_SCENE_CONFIG.clampMin,
              })
            }
            type="button"
          >
            Reset
          </button>
        }
        title="Levels"
      >
        <Slider
          label="Black Point"
          max={100}
          min={0}
          onValueChange={(value) =>
            handleUpdate(
              "clampMin",
              Math.min(value / 100, sceneConfig.clampMax - 0.01)
            )
          }
          value={sceneConfig.clampMin * 100}
        />
        <Slider
          label="White Point"
          max={100}
          min={0}
          onValueChange={(value) =>
            handleUpdate(
              "clampMax",
              Math.max(value / 100, sceneConfig.clampMin + 0.01)
            )
          }
          value={sceneConfig.clampMax * 100}
        />
        <Slider
          label="Gamma"
          max={400}
          min={10}
          onValueChange={(value) => handleUpdate("clampGamma", value / 100)}
          value={sceneConfig.clampGamma * 100}
        />
      </Section>

      {/* Quantize */}
      <Section title="Quantize">
        <Row label="Enabled">
          <Toggle
            checked={sceneConfig.quantizeEnabled}
            onCheckedChange={(value) => handleUpdate("quantizeEnabled", value)}
          />
        </Row>
        {sceneConfig.quantizeEnabled && (
          <Slider
            label="Levels"
            max={256}
            min={2}
            onValueChange={(value) =>
              handleUpdate("quantizeLevels", Math.round(value))
            }
            value={sceneConfig.quantizeLevels}
          />
        )}
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
  )
}
