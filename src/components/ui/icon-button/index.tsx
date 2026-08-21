"use client"

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react"
import {
  iconButtonVariants,
  type IconButtonVariantProps,
} from "@/components/ui/icon-button/variants"
import { HoverTooltip } from "@/components/ui/tooltip"
import type { UISoundId } from "@/lib/audio/shader-lab-sounds"
import { playOptionalUISound } from "@/lib/audio/shader-lab-sounds"
import { cn } from "@/lib/cn"

type CommonIconButtonProps = {
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
  tooltip?: ReactNode
  tooltipAlign?: "center" | "start" | "end"
  tooltipDisabled?: boolean
  tooltipSide?: "top" | "right" | "bottom" | "left"
  uiSound?: UISoundId | "none"
} & IconButtonVariantProps

type IconButtonProps = CommonIconButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">

export function IconButton({
  children,
  className,
  labelled,
  ref,
  selected,
  title,
  tooltip,
  tooltipAlign,
  tooltipDisabled,
  tooltipSide,
  uiSound = "generic.press",
  variant,
  ...props
}: IconButtonProps) {
  const tooltipContent =
    tooltip ??
    title ??
    (typeof props["aria-label"] === "string" ? props["aria-label"] : undefined)

  const button = (
    <button
      aria-pressed={props["aria-pressed"] ?? selected ?? undefined}
      className={cn(
        iconButtonVariants({ labelled, selected, variant }),
        className
      )}
      type="button"
      {...props}
      onClick={(event) => {
        props.onClick?.(event)

        if (event.defaultPrevented || props["aria-disabled"] === true) {
          return
        }

        playOptionalUISound(uiSound)
      }}
      ref={ref}
    >
      {children}
    </button>
  )

  return (
    <HoverTooltip
      align={tooltipAlign}
      content={tooltipContent}
      disabled={tooltipDisabled ?? props.disabled}
      side={tooltipSide}
    >
      {button}
    </HoverTooltip>
  )
}
