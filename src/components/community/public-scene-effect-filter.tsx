"use client"

import type { Route } from "next"
import Link from "next/link"
import type { MouseEvent } from "react"
import { EdgeFadeScroller } from "@/components/community/edge-fade-scroller"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import { communityEffectsPath } from "@/lib/community/scene-links"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { EffectLayerType } from "@/types/editor"

const CHIP_CLASS_NAME =
  "inline-flex h-[var(--ds-size-icon-button)] shrink-0 items-center rounded-icon px-[var(--ds-space-3)] transition-[background-color,box-shadow,color] duration-160 ease-[var(--ease-out-cubic)]"
const CHIP_ACTIVE =
  "bg-[var(--skin-raised)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-raised)]"
const CHIP_IDLE =
  "text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-active)] hover:text-[var(--ds-color-text-primary)]"

const NO_EFFECTS: readonly EffectLayerType[] = []

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
  )
}

export function PublicSceneEffectFilter({
  effects,
  onSelect,
}: {
  effects: readonly EffectLayerType[]
  onSelect: (effects: readonly EffectLayerType[]) => void
}) {
  const selected = new Set(effects)

  const chipClick =
    (next: readonly EffectLayerType[]) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(event)) {
        return
      }

      event.preventDefault()
      onSelect(next)
    }

  return (
    <div className="flex min-w-0 flex-1 rounded-group border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] p-bar-group">
    <EdgeFadeScroller
      arrows
      className="gap-0.5"
      element="nav"
      label="Filter community scenes by effect"
    >
      <Link
        aria-current={effects.length > 0 ? undefined : "page"}
        className={cn(
          CHIP_CLASS_NAME,
          effects.length > 0
            ? CHIP_IDLE
            : CHIP_ACTIVE
        )}
        href={communityEffectsPath(NO_EFFECTS) as Route}
        onClick={chipClick(NO_EFFECTS)}
        prefetch={false}
      >
        <Typography as="span" tone="inherit" variant="label">
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
              CHIP_CLASS_NAME,
              active
                ? CHIP_ACTIVE
                : CHIP_IDLE
            )}
            href={communityEffectsPath(nextEffects) as Route}
            key={effectType}
            onClick={chipClick(nextEffects)}
            prefetch={false}
          >
            <Typography as="span" tone="inherit" variant="label">
              {getLayerLabel(effectType)}
            </Typography>
          </Link>
        )
      })}
    </EdgeFadeScroller>
    </div>
  )
}
