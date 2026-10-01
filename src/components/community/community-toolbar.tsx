"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense } from "react"
import { ThemeToggleButton } from "@/components/editor/theme-toggle-button"
import { ButtonLink } from "@/components/ui/button/link"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  COMMUNITY_PATH,
  EDITOR_PATH,
  EFFECTS_PATH,
} from "@/lib/community/scene-links"

const LINKS = [
  { href: COMMUNITY_PATH, label: "Scenes" },
  { href: EFFECTS_PATH, label: "Effects" },
] as const

function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) {
    return false
  }
  if (href === COMMUNITY_PATH) {
    return pathname === COMMUNITY_PATH
  }
  return pathname.startsWith(href)
}

export function CommunityToolbar() {
  return (
    <Suspense fallback={<CommunityToolbarView pathname={null} />}>
      <CommunityToolbarWithPath />
    </Suspense>
  )
}

function CommunityToolbarWithPath() {
  return <CommunityToolbarView pathname={usePathname()} />
}

function CommunityToolbarView({ pathname }: { pathname: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-3">
      <GlassPanel
        className="pointer-events-auto flex min-h-11 w-full max-w-[560px] items-center justify-between gap-[var(--ds-space-3)] rounded-toolbar px-bar"
        data-toolbar=""
        variant="panel"
      >
        <Link
          className="hidden h-[var(--ds-size-icon-button)] shrink-0 items-center whitespace-nowrap rounded-icon sm:inline-flex px-[var(--ds-space-2)] transition-colors duration-160 ease-[var(--ease-out-cubic)] hover:bg-[var(--ds-color-surface-active)]"
          href={EDITOR_PATH as Route}
        >
          <Typography as="span" variant="label">
            Shader Lab
          </Typography>
        </Link>

        <nav
          aria-label="Community"
          className="inline-flex items-center gap-0.5 rounded-group border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] p-bar-group"
        >
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href)
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-[var(--ds-size-icon-button)] items-center rounded-icon px-[var(--ds-space-2_5)] transition-[background-color,box-shadow,color] sm:px-[var(--ds-space-3)] duration-160 ease-[var(--ease-out-cubic)]",
                  active
                    ? "bg-[var(--skin-raised)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-raised)]"
                    : "text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]"
                )}
                href={link.href as Route}
                key={link.href}
              >
                <Typography as="span" tone="inherit" variant="label">
                  {link.label}
                </Typography>
              </Link>
            )
          })}
        </nav>

        <div className="inline-flex shrink-0 items-center gap-[var(--ds-space-1_5)]">
          <ThemeToggleButton />
          <ButtonLink
            href={EDITOR_PATH as Route}
            size="compact"
            variant="primary"
          >
            <span className="sm:hidden">Open</span>
            <span className="hidden sm:inline">Open Shader Lab</span>
          </ButtonLink>
        </div>
      </GlassPanel>
    </div>
  )
}
