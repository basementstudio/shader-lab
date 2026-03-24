import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithoutRef, ElementType } from "react"
import { cn } from "@/lib/cn"

const typographyVariants = cva("m-0", {
  variants: {
    variant: {
      display: "type-display",
      heading: "type-heading",
      title: "type-title",
      body: "type-body",
      label: "type-label",
      caption: "type-caption",
      overline: "type-overline",
      monoMd: "type-mono-md",
      monoSm: "type-mono-sm",
      monoXs: "type-mono-xs",
    },
    tone: {
      primary: "text-[var(--ds-color-text-primary)]",
      secondary: "text-[var(--ds-color-text-secondary)]",
      tertiary: "text-[var(--ds-color-text-tertiary)]",
      muted: "text-[var(--ds-color-text-muted)]",
      disabled: "text-[var(--ds-color-text-disabled)]",
      onLight: "text-[var(--ds-color-text-on-light)]",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
  },
  defaultVariants: {
    variant: "body",
    tone: "primary",
    align: "left",
  },
})

type TypographyProps<T extends ElementType> = {
  as?: T
} & VariantProps<typeof typographyVariants> &
  Omit<ComponentPropsWithoutRef<T>, "as" | "color">

export function Typography<T extends ElementType = "p">({
  as,
  className,
  variant,
  tone,
  align,
  ...props
}: TypographyProps<T>) {
  const Component = as ?? "p"

  return (
    <Component
      className={cn(typographyVariants({ variant, tone, align }), className)}
      {...props}
    />
  )
}
