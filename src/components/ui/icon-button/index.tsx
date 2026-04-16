import { cva, type VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes, Ref, ReactNode } from "react"
import { cn } from "@/lib/cn"
import { HoverTooltip } from "@/components/ui/tooltip"

const iconButtonVariants = cva(
  "inline-flex h-7 w-7 shrink-0 origin-center cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border-0 bg-transparent text-[var(--ds-color-text-tertiary)] transition-[background-color,box-shadow,color,transform] duration-160 ease-[var(--ease-out-cubic)] will-change-transform disabled:cursor-not-allowed [&_svg]:h-3.5 [&_svg]:w-3.5 hover:not-disabled:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        ghost:
          "bg-transparent text-[var(--ds-color-text-tertiary)] hover:bg-transparent hover:text-[var(--ds-color-text-primary)] hover:shadow-none",
        default:
          "bg-[var(--ds-color-surface-subtle)] text-[var(--ds-color-text-tertiary)] hover:bg-white/8 hover:text-[var(--ds-color-text-secondary)]",
        hover:
          "bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-secondary)]",
        active: "bg-white/12 text-white/70",
        primary:
          "bg-[var(--ds-color-text-primary)] text-[var(--ds-color-text-on-light)] hover:not-disabled:bg-white/82 hover:not-disabled:text-[var(--ds-color-text-on-light)] hover:not-disabled:shadow-none active:not-disabled:bg-white/72 disabled:bg-white/18 disabled:text-black/45",
        emphasis:
          "bg-[linear-gradient(180deg,rgb(255_255_255_/_0.12),rgb(255_255_255_/_0.04))] text-[var(--ds-color-text-primary)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12),inset_0_0_0_1px_rgb(255_255_255_/_0.08)] hover:not-disabled:bg-[linear-gradient(180deg,rgb(255_255_255_/_0.18),rgb(255_255_255_/_0.06))] hover:not-disabled:text-[var(--ds-color-text-primary)] hover:not-disabled:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.16),inset_0_0_0_1px_rgb(255_255_255_/_0.12)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type CommonIconButtonProps = {
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
  tooltip?: ReactNode
  tooltipAlign?: "center" | "start" | "end"
  tooltipSide?: "top" | "right" | "bottom" | "left"
} & VariantProps<typeof iconButtonVariants>

type IconButtonProps = CommonIconButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">

export function IconButton({
  children,
  className,
  ref,
  title,
  tooltip,
  tooltipAlign,
  tooltipSide,
  variant,
  ...props
}: IconButtonProps) {
  const tooltipContent =
    tooltip ??
    title ??
    (typeof props["aria-label"] === "string" ? props["aria-label"] : undefined)

  const button = (
    <button
      className={cn(iconButtonVariants({ variant }), className)}
      ref={ref}
      type="button"
      {...props}
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
