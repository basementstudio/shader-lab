"use client"

import { Tooltip } from "@base-ui/react/tooltip"
import type { ReactElement, ReactNode } from "react"
import { cn } from "@/lib/cn"

type TooltipSide = "top" | "right" | "bottom" | "left"
type TooltipAlign = "center" | "start" | "end"

type HoverTooltipProps = {
  align?: TooltipAlign | undefined
  children: ReactElement
  className?: string | undefined
  closeDelay?: number | undefined
  content?: ReactNode | undefined
  delay?: number | undefined
  disabled?: boolean | undefined
  side?: TooltipSide | undefined
  sideOffset?: number | undefined
}

export function HoverTooltip({
  align = "center",
  children,
  className,
  closeDelay,
  content,
  delay,
  disabled = false,
  side = "top",
  sideOffset = 10,
}: HoverTooltipProps) {
  if (!content || disabled) {
    return children
  }

  return (
    <Tooltip.Root disableHoverablePopup>
      <Tooltip.Trigger
        closeDelay={closeDelay ?? 0}
        closeOnClick={false}
        delay={delay ?? 320}
        render={children}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner
          align={align}
          className="z-[80]"
          side={side}
          sideOffset={sideOffset}
        >
          <Tooltip.Popup
            className={cn(
              "pointer-events-none max-w-[220px] rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-panel)] bg-[rgb(16_16_20_/_0.96)] px-2.5 py-1.5 font-[var(--ds-font-mono)] text-[10px] leading-[1.35] text-[var(--ds-color-text-secondary)] shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[20px] transition-[opacity,transform] duration-140 ease-[var(--ease-out-cubic)] data-[closed]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0",
              className
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
