"use client"

import {
  GearSixIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackSimpleIcon,
} from "@phosphor-icons/react"
import type { ComponentType } from "react"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"
import { useIsMobileViewport } from "@/hooks/use-is-mobile-viewport"
import { cn } from "@/lib/cn"
import { useEditorStore } from "@/store/editor-store"
import type { MobileEditorPanel } from "@/types/editor"

type MobileDockItem = {
  icon: ComponentType<{ size: number; weight: "fill" | "regular" }>
  label: string
  panel: Exclude<MobileEditorPanel, "none">
}

const MOBILE_DOCK_ITEMS: readonly MobileDockItem[] = [
  { icon: StackSimpleIcon, label: "Layers", panel: "layers" },
  { icon: SlidersHorizontalIcon, label: "Properties", panel: "properties" },
  { icon: GearSixIcon, label: "Scene", panel: "scene" },
  { icon: SquaresFourIcon, label: "Actions", panel: "actions" },
] as const

export function MobileEditorDock() {
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const mobilePanel = useEditorStore((state) => state.mobilePanel)
  const setMobilePanel = useEditorStore((state) => state.setMobilePanel)
  const closeTimelinePanel = useEditorStore((state) => state.closeTimelinePanel)
  const isMobileViewport = useIsMobileViewport()

  if (immersiveCanvas || !isMobileViewport) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-0 bottom-4 left-0 z-50 flex justify-center px-3">
      <GlassPanel
        className="pointer-events-auto grid w-full max-w-[420px] grid-cols-4 gap-1 p-1.5"
        variant="panel"
      >
        {MOBILE_DOCK_ITEMS.map(({ icon: Icon, label, panel }) => {
          const isActive = mobilePanel === panel

          return (
            <button
              aria-label={label}
              aria-pressed={isActive}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--ds-radius-control)] border border-transparent px-2 py-2 text-[var(--ds-color-text-muted)] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] active:scale-[0.97]",
                isActive
                  ? "border-white/10 bg-white/10 text-[var(--ds-color-text-primary)]"
                  : "hover:border-white/6 hover:bg-white/6 hover:text-[var(--ds-color-text-secondary)]"
              )}
              key={panel}
              onClick={() => {
                closeTimelinePanel()
                setMobilePanel(isActive ? "none" : panel)
              }}
              type="button"
            >
              <Icon size={18} weight={isActive ? "fill" : "regular"} />
              <Typography
                as="span"
                className="leading-none"
                tone={isActive ? "primary" : "muted"}
                variant="monoXs"
              >
                {label}
              </Typography>
            </button>
          )
        })}
      </GlassPanel>
    </div>
  )
}
