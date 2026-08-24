"use client"

import { ArrowDownIcon } from "@radix-ui/react-icons"
import type { Route } from "next"
import { SCENES_ANCHOR_ID } from "@/components/community/scenes-anchor"
import { ButtonLink } from "@/components/ui/button/link"

export function HeroScrollCue() {
  return (
    <ButtonLink
      className="group"
      href={`#${SCENES_ANCHOR_ID}` as Route}
      onClick={(event) => {
        const target = document.getElementById(SCENES_ANCHOR_ID)

        if (!target) {
          return
        }

        event.preventDefault()

        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches

        target.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        })
      }}
      variant="primary"
    >
      Check out scenes
      <span className="transition-transform duration-160 ease-[var(--ease-out-cubic)] group-hover:translate-y-0.5">
        <ArrowDownIcon height={14} width={14} />
      </span>
    </ButtonLink>
  )
}
