"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import {
  buttonVariants,
  type ButtonVariantProps,
} from "@/components/ui/button/variants"
import { HoverTooltip } from "@/components/ui/tooltip"
import type { UISoundId } from "@/lib/audio/shader-lab-sounds"
import { playOptionalUISound } from "@/lib/audio/shader-lab-sounds"
import { cn } from "@/lib/cn"

type CommonButtonProps = {
  children?: ReactNode
  tooltip?: ReactNode
  tooltipAlign?: "center" | "start" | "end"
  tooltipSide?: "top" | "right" | "bottom" | "left"
  uiSound?: UISoundId | "none"
} & ButtonVariantProps

type ButtonProps = CommonButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">

export function Button({
  children,
  className,
  fullWidth,
  size,
  title,
  tooltip,
  tooltipAlign,
  tooltipSide,
  uiSound = "generic.press",
  variant,
  ...props
}: ButtonProps) {
  const tooltipContent =
    tooltip ??
    title ??
    (typeof props["aria-label"] === "string" ? props["aria-label"] : undefined)

  const button = (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      type="button"
      {...props}
      onClick={(event) => {
        props.onClick?.(event)

        if (event.defaultPrevented || props["aria-disabled"] === true) {
          return
        }

        playOptionalUISound(uiSound)
      }}
    >
      {children}
    </button>
  )

  return (
    <HoverTooltip
      align={tooltipAlign}
      content={tooltipContent}
      disabled={props.disabled}
      side={tooltipSide}
    >
      {button}
    </HoverTooltip>
  )
}
