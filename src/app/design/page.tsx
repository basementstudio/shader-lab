import type { CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Select } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Typography } from "@/components/ui/typography"

const typeSamples = [
  {
    label: "Display / 48px / 700",
    variant: "display",
    text: "Shader Lab Aa",
  },
  {
    label: "Heading / 24px / 600",
    variant: "heading",
    text: "Heading Aa Bb Cc",
  },
  {
    label: "Title / 16px / 500",
    variant: "title",
    text: "Panel Title Aa Bb Cc Dd",
  },
  {
    label: "Body / 13px / 500",
    variant: "body",
    text: "Project name, navigation items",
  },
  {
    label: "Label / 12px / 400",
    variant: "label",
    text: "Layer names, property labels",
  },
  {
    label: "Caption / 11px / 400",
    variant: "caption",
    text: "Secondary labels, control text",
  },
  {
    label: "Overline / 10px / 500",
    variant: "overline",
    text: "Section headers, overlines",
  },
  {
    label: "Mono / 13px / 400",
    variant: "monoMd",
    text: "vec3(0.5, 0.8, 1.0)",
  },
  {
    label: "Mono / 11px / 400",
    variant: "monoSm",
    text: "Auto (Base) Normal 100% 0.00 1:1 80% 4.00s",
  },
  {
    label: "Mono / 10px / 400",
    variant: "monoXs",
    text: "0.00s / 4.00s rgba(255,255,255,0.5)",
  },
] as const

const blendModeOptions = [
  { label: "Normal", value: "normal" },
  { label: "Multiply", value: "multiply" },
  { label: "Screen", value: "screen" },
  { label: "Overlay", value: "overlay" },
  { label: "Soft Light", value: "soft-light" },
] as const

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 14 14">
      <path
        d="M7 3V11M3 7H11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 14 14">
      <path
        d="M3 7H11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  )
}

function FocusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 14 14">
      <path
        d="M2.5 5V2.5H5M9 2.5H11.5V5M11.5 9V11.5H9M5 11.5H2.5V9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  )
}

function GlassPreview({
  caption,
  className,
  light,
  style,
}: {
  caption: string
  className: string
  light?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[260px] flex-col gap-[var(--ds-space-3)] overflow-hidden rounded-[var(--ds-radius-panel)] p-[20px]",
        className
      )}
      style={style}
    >
      <Typography
        className="relative z-1"
        tone={light ? "onLight" : "muted"}
        variant="monoXs"
      >
        {caption}
      </Typography>

      <GlassPanel
        className={cn(
          "relative z-1",
          light ? "shadow-[var(--ds-shadow-panel-light)]" : undefined
        )}
        variant="panel"
      >
        <div className="border-white/6 border-b px-[12px] py-[10px]">
          <Typography tone="secondary" variant="overline">
            Layers
          </Typography>
        </div>

        <div className="mx-[4px] mt-[4px] flex items-center gap-[var(--ds-space-2)] rounded-[var(--ds-radius-icon)] bg-[var(--ds-color-surface-active)] px-[8px] py-[6px]">
          <div className="h-[24px] w-[24px] flex-shrink-0 rounded-[var(--ds-radius-thumb)] bg-white/6" />
          <Typography variant="label">Image</Typography>
        </div>

        <div className="mx-[4px] flex items-center gap-[var(--ds-space-2)] px-[8px] py-[6px]">
          <div className="h-[24px] w-[24px] flex-shrink-0 rounded-[var(--ds-radius-thumb)] bg-white/4" />
          <Typography tone="secondary" variant="label">
            Exposure
          </Typography>
        </div>
      </GlassPanel>

      <GlassPanel
        className={cn(
          "relative z-1",
          light ? "shadow-[var(--ds-shadow-pill-light)]" : undefined
        )}
        variant="pill"
      >
        <Typography variant="body">shader lab</Typography>
        <div className="h-[14px] w-px bg-white/8" />
        <Typography tone="secondary" variant="monoSm">
          80%
        </Typography>
      </GlassPanel>
    </div>
  )
}

export default function DesignPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col gap-[var(--ds-space-8)] px-[clamp(24px,4vw,48px)] py-[clamp(24px,4vw,48px)]">
      <div className="pointer-events-none absolute inset-0" />

      <section className="relative z-1 grid gap-[var(--ds-space-6)] pt-[clamp(24px,7vh,72px)] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <div className="flex max-w-[720px] flex-col gap-[var(--ds-space-4)]">
          <Typography tone="muted" variant="overline">
            Shader Lab UI Foundation
          </Typography>
          <Typography as="h1" variant="display">
            Design System
          </Typography>
          <Typography className="max-w-[46ch]" tone="secondary" variant="body">
            Typography, glass surfaces, and core controls aligned to the Paper
            system. This page is the implementation specimen, not a marketing
            page.
          </Typography>
        </div>

        <GlassPanel
          className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
          variant="panel"
        >
          <Typography tone="secondary" variant="overline">
            Primitives
          </Typography>
          <div className="grid gap-[var(--ds-space-4)] sm:grid-cols-2 lg:grid-cols-2">
            <div>
              <Typography variant="title">4 Shared Components</Typography>
              <Typography tone="secondary" variant="caption">
                Typography, button, icon button, glass panel
              </Typography>
            </div>
            <div>
              <Typography variant="title">Dark Editor Base</Typography>
              <Typography tone="secondary" variant="caption">
                Monochrome, alpha-led, glass-first
              </Typography>
            </div>
          </div>
        </GlassPanel>
      </section>

      <section className="relative z-1 flex flex-col gap-[var(--ds-space-5)]">
        <div className="flex max-w-[720px] flex-col gap-[var(--ds-space-2)]">
          <Typography tone="muted" variant="overline">
            Typography
          </Typography>
          <Typography as="h2" variant="heading">
            Type scale from the design system
          </Typography>
        </div>

        <GlassPanel
          className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
          variant="panel"
        >
          {typeSamples.map((sample) => (
            <div
              className="grid gap-[var(--ds-space-2)] border-white/4 border-b py-[12px] first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] sm:gap-[var(--ds-space-4)]"
              key={sample.label}
            >
              <Typography tone="muted" variant="monoXs">
                {sample.label}
              </Typography>
              <Typography variant={sample.variant}>{sample.text}</Typography>
            </div>
          ))}
        </GlassPanel>
      </section>

      <section className="relative z-1 flex flex-col gap-[var(--ds-space-5)]">
        <div className="flex max-w-[720px] flex-col gap-[var(--ds-space-2)]">
          <Typography tone="muted" variant="overline">
            Components
          </Typography>
          <Typography as="h2" variant="heading">
            Core custom controls
          </Typography>
        </div>

        <div className="grid gap-[var(--ds-space-4)] lg:grid-cols-2">
          <GlassPanel
            className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
            variant="panel"
          >
            <Typography tone="muted" variant="overline">
              Buttons
            </Typography>
            <div className="flex flex-wrap items-center gap-[var(--ds-space-3)]">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled variant="neutral">
                Disabled
              </Button>
            </div>
          </GlassPanel>

          <GlassPanel
            className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
            variant="panel"
          >
            <Typography tone="muted" variant="overline">
              Slider
            </Typography>
            <div className="flex max-w-[320px] flex-col gap-[var(--ds-space-4)]">
              <Slider
                defaultValue={75}
                label="Opacity"
                valueFormatOptions={{ maximumFractionDigits: 0 }}
                valueSuffix="%"
              />
              <Slider
                defaultValue={50}
                label="Exposure"
                max={2}
                min={-2}
                step={0.01}
                valueFormatOptions={{
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                }}
              />
            </div>
          </GlassPanel>

          <GlassPanel
            className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
            variant="panel"
          >
            <Typography tone="muted" variant="overline">
              Icon Buttons
            </Typography>
            <div className="flex flex-wrap items-center gap-[var(--ds-space-3)]">
              <IconButton aria-label="Add" variant="default">
                <PlusIcon />
              </IconButton>
              <IconButton aria-label="Hover state" variant="hover">
                <MinusIcon />
              </IconButton>
              <IconButton aria-label="Active state" variant="active">
                <FocusIcon />
              </IconButton>
            </div>
          </GlassPanel>

          <GlassPanel
            className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
            variant="panel"
          >
            <Typography tone="muted" variant="overline">
              Toggle
            </Typography>
            <div className="flex flex-wrap items-center gap-[24px]">
              <Toggle defaultChecked label="On" />
              <Toggle label="Off" />
            </div>
          </GlassPanel>

          <GlassPanel
            className="flex flex-col gap-[var(--ds-space-4)] p-[20px]"
            variant="panel"
          >
            <Typography tone="muted" variant="overline">
              Select
            </Typography>
            <Select
              defaultValue="normal"
              label="Blend mode"
              options={blendModeOptions}
              placeholder="Select mode"
            />
          </GlassPanel>
        </div>
      </section>

      <section className="relative z-1 flex flex-col gap-[var(--ds-space-5)]">
        <div className="flex max-w-[720px] flex-col gap-[var(--ds-space-2)]">
          <Typography tone="muted" variant="overline">
            Glass
          </Typography>
          <Typography as="h2" variant="heading">
            Same glass language over three backgrounds
          </Typography>
          <Typography tone="secondary" variant="body">
            White, black, and a flower image from the local asset set. The
            surface stays translucent, bordered, and readable in all three
            contexts.
          </Typography>
        </div>

        <div className="grid gap-[var(--ds-space-4)] lg:grid-cols-3">
          <GlassPreview
            caption="On black #080808"
            className="bg-[var(--ds-color-canvas)]"
          />
          <GlassPreview
            caption="On white #F5F5F5"
            className="bg-[linear-gradient(135deg,rgba(255,255,255,0.8),rgba(245,245,245,1))]"
            light
          />
          <GlassPreview
            caption="On flower image"
            className="before:absolute before:inset-0 before:bg-[linear-gradient(180deg,rgba(8,8,8,0.08),rgba(8,8,8,0.32))] before:content-['']"
            style={{
              backgroundImage: "url('/assets/flowers-01.jpeg')",
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
        </div>
      </section>
    </main>
  )
}
