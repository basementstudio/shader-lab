import type { Route } from "next"
import Link from "next/link"
import { EdgeFadeScroller } from "@/components/community/edge-fade-scroller"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  communityEffectsPath,
} from "@/lib/community/scene-links"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { EffectLayerType } from "@/types/editor"

export function PublicSceneEffectFilter({
  effects,
}: {
  effects: readonly EffectLayerType[]
}) {
  const selected = new Set(effects)

  return (
    <EdgeFadeScroller
      arrows
      className="gap-2 py-0.5"
      element="nav"
      label="Filter community scenes by effect"
    >
      <Link
        aria-current={effects.length > 0 ? undefined : "page"}
        className={cn(
          "inline-flex min-h-7 shrink-0 items-center rounded-[var(--ds-radius-control)] border px-3 transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
          effects.length > 0
            ? "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)] hover:bg-[var(--ds-color-surface-subtle)]"
            : "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
        )}
        href={COMMUNITY_PATH as Route}
        scroll={false}
      >
        <Typography as="span" variant="label">
          All
        </Typography>
      </Link>

      {COMMUNITY_EFFECT_TYPES.map((effectType) => {
        const active = selected.has(effectType)
        const nextEffects = active
          ? effects.filter((effect) => effect !== effectType)
          : COMMUNITY_EFFECT_TYPES.filter(
              (effect) => selected.has(effect) || effect === effectType
            )

        return (
          <Link
            aria-label={`${getLayerLabel(effectType)}, ${active ? "selected; remove filter" : "add filter"}`}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center rounded-[var(--ds-radius-control)] border px-3 transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
              active
                ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
                : "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)] hover:bg-[var(--ds-color-surface-subtle)]"
            )}
            href={communityEffectsPath(nextEffects) as Route}
            key={effectType}
            scroll={false}
          >
            <Typography as="span" variant="label">
              {getLayerLabel(effectType)}
            </Typography>
          </Link>
        )
      })}
    </EdgeFadeScroller>
  )
}
