import Link from "next/link"
import type { ComponentProps } from "react"
import {
  iconButtonVariants,
  type IconButtonVariantProps,
} from "@/components/ui/icon-button/variants"
import { cn } from "@/lib/cn"

type IconButtonLinkProps = IconButtonVariantProps &
  Omit<ComponentProps<typeof Link>, "className"> & { className?: string }

export function IconButtonLink({
  children,
  className,
  selected,
  variant,
  ...props
}: IconButtonLinkProps) {
  return (
    <Link
      className={cn(iconButtonVariants({ selected, variant }), className)}
      {...props}
    >
      {children}
    </Link>
  )
}
