import Link from "next/link"
import type { ComponentProps } from "react"
import {
  buttonVariants,
  type ButtonVariantProps,
} from "@/components/ui/button/variants"
import { cn } from "@/lib/cn"

type ButtonLinkProps = ButtonVariantProps &
  Omit<ComponentProps<typeof Link>, "className"> & { className?: string }

export function ButtonLink({
  children,
  className,
  fullWidth,
  size,
  variant,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonVariants({ fullWidth, size, variant }), className)}
      {...props}
    >
      {children}
    </Link>
  )
}
