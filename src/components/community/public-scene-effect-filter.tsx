import type { Route } from "next"
import Link from "next/link"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { COMMUNITY_EFFECT_TYPES } from "@/lib/community/scene-effect-filter"
import {
  COMMUNITY_PATH,
  communityEffectPath,
} from "@/lib/community/scene-links"
import { getLayerLabel } from "@/lib/editor/config/layer-catalog"
import type { EffectLayerType } from "@/types/editor"

export function PublicSceneEffectFilter({
  effect,
}: {
  effect?: EffectLayerType
}) {
  return (
    <nav
      aria-label="Filter community scenes by effect"
      className="flex min-w-0 gap-2 overflow-x-auto pb-0.5"
    >
      <Link
        aria-current={effect ? undefined : "page"}
        className={cn(
          "inline-flex min-h-7 shrink-0 items-center rounded-[var(--ds-radius-control)] border px-3 transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
          effect
            ? "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)] hover:bg-[var(--ds-color-surface-subtle)]"
            : "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
        )}
        href={COMMUNITY_PATH as Route}
      >
        <Typography as="span" variant="label">
          All
        </Typography>
      </Link>

      {COMMUNITY_EFFECT_TYPES.map((effectType) => (
        <Link
          aria-current={effect === effectType ? "page" : undefined}
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center rounded-[var(--ds-radius-control)] border px-3 transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
            effect === effectType
              ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
              : "border-[var(--ds-border-subtle)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)] hover:bg-[var(--ds-color-surface-subtle)]"
          )}
          href={communityEffectPath(effectType) as Route}
          key={effectType}
        >
          <Typography as="span" variant="label">
            {getLayerLabel(effectType)}
          </Typography>
        </Link>
      ))}
    </nav>
  )
}
