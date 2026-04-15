"use client"

import {
  DashboardIcon,
  GearIcon,
  LayersIcon,
  MixerHorizontalIcon,
} from "@radix-ui/react-icons"
import type { ElementType } from "react"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import { useEditorStore } from "@/store/editor-store"
import type { MobileEditorPanel } from "@/types/editor"

type MobileDockItem = {
  icon: ElementType
  label: string
  panel: Exclude<MobileEditorPanel, "none">
}

const MOBILE_DOCK_ITEMS: readonly MobileDockItem[] = [
  { icon: LayersIcon, label: "Layers", panel: "layers" },
  { icon: MixerHorizontalIcon, label: "Properties", panel: "properties" },
  { icon: GearIcon, label: "Scene", panel: "scene" },
  { icon: DashboardIcon, label: "Actions", panel: "actions" },
] as const

export function MobileEditorDock() {
  const immersiveCanvas = useEditorStore((state) => state.immersiveCanvas)
  const mobilePanel = useEditorStore((state) => state.mobilePanel)
  const setMobilePanel = useEditorStore((state) => state.setMobilePanel)
  const closeTimelinePanel = useEditorStore((state) => state.closeTimelinePanel)

  if (immersiveCanvas) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-0 bottom-4 left-0 z-50 flex justify-center px-3 min-[900px]:hidden">
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
              <Icon height={18} width={18} />
              <Typography
                as="span"
                className="leading-none"
                tone={isActive ? "primary" : "muted"}
                variant="caption"
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
