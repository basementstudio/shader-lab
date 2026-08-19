import { cva, type VariantProps } from "class-variance-authority"

export const iconButtonVariants = cva(
  "inline-flex h-7 w-7 shrink-0 origin-center cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border-0 bg-transparent text-[var(--ds-color-text-tertiary)] transition-[background-color,box-shadow,color,transform] duration-160 ease-[var(--ease-out-cubic)] will-change-transform disabled:cursor-not-allowed [&_svg]:h-3.5 [&_svg]:w-3.5 hover:not-disabled:shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.04)] active:not-disabled:scale-[0.96]",
  {
    variants: {
      variant: {
        ghost:
          "bg-transparent text-[var(--ds-color-text-tertiary)] hover:bg-transparent hover:text-[var(--ds-color-text-primary)] hover:shadow-none",
        default:
          "bg-[var(--ds-color-surface-subtle)] text-[var(--ds-color-text-tertiary)] hover:bg-[var(--ds-color-surface-active)] hover:text-[var(--ds-color-text-primary)]",
        outline:
          "border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] hover:not-disabled:border-[var(--ds-border-hover)] hover:not-disabled:bg-[var(--ds-color-surface-active)] hover:not-disabled:text-[var(--ds-color-text-primary)] hover:not-disabled:shadow-none",
        primary:
          "bg-[var(--ds-color-text-primary)] text-[var(--ds-color-text-on-light)] hover:not-disabled:bg-white/82 hover:not-disabled:text-[var(--ds-color-text-on-light)] hover:not-disabled:shadow-none active:not-disabled:bg-white/72 disabled:bg-white/18 disabled:text-black/45",
        overlay:
          "bg-[var(--ds-color-surface-overlay)] text-[var(--ds-color-text-primary)] shadow-[inset_0_0_0_1px_var(--ds-border-panel)] backdrop-blur-[8px] hover:not-disabled:bg-[var(--ds-color-surface-overlay-strong)] hover:not-disabled:text-[var(--ds-color-text-primary)] hover:not-disabled:shadow-[inset_0_0_0_1px_var(--ds-border-panel-strong)]",
        emphasis:
          "bg-[linear-gradient(180deg,rgb(255_255_255_/_0.12),rgb(255_255_255_/_0.04))] text-[var(--ds-color-text-primary)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12),inset_0_0_0_1px_rgb(255_255_255_/_0.08)] hover:not-disabled:bg-[linear-gradient(180deg,rgb(255_255_255_/_0.18),rgb(255_255_255_/_0.06))] hover:not-disabled:text-[var(--ds-color-text-primary)] hover:not-disabled:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.16),inset_0_0_0_1px_rgb(255_255_255_/_0.12)]",
      },
      selected: {
        true: "bg-[var(--ds-color-surface-selected)] text-[var(--ds-color-text-primary)] hover:bg-white/20 hover:text-[var(--ds-color-text-primary)]",
      },
      labelled: {
        true: "w-auto gap-1.5 px-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type IconButtonVariantProps = VariantProps<typeof iconButtonVariants>
