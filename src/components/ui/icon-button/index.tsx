import { cva, type VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/cn"

const iconButtonVariants = cva(
  "inline-flex h-7 w-7 shrink-0 origin-center items-center justify-center rounded-[var(--ds-radius-icon)] border-0 bg-transparent text-[var(--ds-color-text-tertiary)] transition-[background-color,box-shadow,color,transform] duration-160 ease-[var(--ease-out-cubic)] will-change-transform [&_svg]:h-3.5 [&_svg]:w-3.5 hover:not-disabled:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] active:not-disabled:scale-[0.96]",
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
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type CommonIconButtonProps = {
  children?: ReactNode
} & VariantProps<typeof iconButtonVariants>

type IconButtonProps = CommonIconButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">

export function IconButton({
  children,
  className,
  variant,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(iconButtonVariants({ variant }), className)}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}
