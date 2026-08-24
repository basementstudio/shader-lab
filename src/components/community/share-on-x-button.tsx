import type { Route } from "next"
import { IconButtonLink } from "@/components/ui/icon-button/link"
import { HoverTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"

function XLogoIcon({
  height = 12,
  width = 12,
}: {
  height?: number
  width?: number
}) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={height}
      viewBox="0 0 24 24"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function ShareOnXButton({
  className,
  shareUrl,
  title,
}: {
  className?: string | undefined
  shareUrl: string
  title: string
}) {
  const params = new URLSearchParams({
    text: `${title} — Shader Lab`,
    url: shareUrl,
  })

  return (
    <HoverTooltip content="Share on X" side="top">
      <IconButtonLink
        aria-label="Share on X"
        className={cn("aspect-square h-auto w-auto shrink-0", className)}
        href={`https://x.com/intent/post?${params.toString()}` as Route}
        rel="noreferrer"
        target="_blank"
        variant="outline"
      >
        <XLogoIcon />
      </IconButtonLink>
    </HoverTooltip>
  )
}
