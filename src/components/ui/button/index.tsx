import { cva, type VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"
import { HoverTooltip } from "@/components/ui/tooltip"

const buttonVariants = cva(
  "inline-flex origin-center cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--ds-radius-control)] border border-transparent font-[var(--ds-font-sans)] text-[12px] font-medium leading-4 text-decoration-none transition-[background-color,border-color,color,opacity,transform] duration-160 ease-[var(--ease-out-cubic)] will-change-transform disabled:cursor-not-allowed disabled:opacity-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-100 active:scale-[0.98] data-[state=active]:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--ds-color-text-primary)] text-[var(--ds-color-text-on-light)] hover:bg-white/82 active:bg-white/72 disabled:bg-white/18 disabled:text-black/45 aria-disabled:bg-white/18 aria-disabled:text-black/45",
        secondary:
          "bg-[var(--ds-color-surface-control)] border-[var(--ds-border-divider)] text-white/70 hover:bg-white/10 hover:border-[var(--ds-border-hover)] hover:text-white/80 active:bg-white/14 active:border-[var(--ds-border-active)] active:text-[var(--ds-color-text-primary)] data-[state=active]:bg-white/14 data-[state=active]:border-[var(--ds-border-active)] data-[state=active]:text-[var(--ds-color-text-primary)] disabled:bg-[var(--ds-color-surface-disabled)] disabled:border-[var(--ds-border-disabled)] disabled:text-[var(--ds-color-text-disabled)] aria-disabled:bg-[var(--ds-color-surface-disabled)] aria-disabled:border-[var(--ds-border-disabled)] aria-disabled:text-[var(--ds-color-text-disabled)]",
        ghost:
          "text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)] active:text-white/72 data-[state=active]:text-white/72 disabled:text-[var(--ds-color-text-disabled)] aria-disabled:text-[var(--ds-color-text-disabled)]",
        neutral:
          "bg-white/6 border-white/8 text-white/60 hover:bg-white/10 hover:border-white/12 hover:text-white/80 active:bg-white/14 active:border-white/14 active:text-[var(--ds-color-text-primary)] data-[state=active]:bg-white/14 data-[state=active]:border-white/14 data-[state=active]:text-[var(--ds-color-text-primary)] disabled:bg-[var(--ds-color-surface-disabled)] disabled:border-[var(--ds-border-disabled)] disabled:text-[var(--ds-color-text-disabled)] aria-disabled:bg-[var(--ds-color-surface-disabled)] aria-disabled:border-[var(--ds-border-disabled)] aria-disabled:text-[var(--ds-color-text-disabled)]",
      },
      size: {
        compact: "px-[14px] py-[6px]",
        default: "px-5 py-2",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  }
)

type CommonButtonProps = {
  children?: ReactNode
  tooltip?: ReactNode
  tooltipAlign?: "center" | "start" | "end"
  tooltipSide?: "top" | "right" | "bottom" | "left"
} & VariantProps<typeof buttonVariants>

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
