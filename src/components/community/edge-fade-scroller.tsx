"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons"
import type { CSSProperties, ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { IconButton } from "@/components/ui/icon-button"
import { cn } from "@/lib/cn"

const FADE_WIDTH = "32px"
const SCROLL_FRACTION = 0.8

type ScrollerElement = "div" | "fieldset" | "nav"

function maskFor(fadeStart: boolean, fadeEnd: boolean): CSSProperties {
  if (!(fadeStart || fadeEnd)) {
    return {}
  }

  const stops = [
    fadeStart ? `transparent 0, #000 ${FADE_WIDTH}` : "#000 0",
    fadeEnd ? `#000 calc(100% - ${FADE_WIDTH}), transparent 100%` : "#000 100%",
  ].join(", ")

  const mask = `linear-gradient(to right, ${stops})`

  return { maskImage: mask, WebkitMaskImage: mask } as CSSProperties
}

export function EdgeFadeScroller({
  arrows = false,
  children,
  className,
  element = "div",
  label,
}: {
  arrows?: boolean
  children: ReactNode
  className?: string
  element?: ScrollerElement
  label: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [fadeStart, setFadeStart] = useState(false)
  const [fadeEnd, setFadeEnd] = useState(false)

  const measure = useCallback(() => {
    const node = scrollRef.current

    if (!node) {
      return
    }

    const maxScroll = node.scrollWidth - node.clientWidth

    setFadeStart(node.scrollLeft > 1)
    setFadeEnd(maxScroll > 1 && node.scrollLeft < maxScroll - 1)
  }, [])

  useEffect(() => {
    const node = scrollRef.current

    if (!node) {
      return
    }

    measure()

    const observer = new ResizeObserver(measure)

    observer.observe(node)

    for (const child of Array.from(node.children)) {
      observer.observe(child)
    }

    return () => observer.disconnect()
  }, [measure])

  const nudge = useCallback((direction: -1 | 1) => {
    const node = scrollRef.current

    if (!node) {
      return
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    node.scrollBy({
      behavior: reduceMotion ? "auto" : "smooth",
      left: direction * node.clientWidth * SCROLL_FRACTION,
    })
  }, [])

  const Element = element
  const scrollable = fadeStart || fadeEnd

  return (
    <Element
      aria-label={label}
      className="m-0 flex min-w-0 flex-1 items-center gap-1.5 border-0 p-0"
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className
        )}
        onScroll={measure}
        ref={scrollRef}
        style={maskFor(fadeStart, fadeEnd)}
      >
        {children}
      </div>

      {arrows && scrollable ? (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            aria-label="Scroll filters left"
            className="h-7 w-7"
            disabled={!fadeStart}
            onClick={() => nudge(-1)}
            variant="default"
          >
            <ChevronLeftIcon height={14} width={14} />
          </IconButton>
          <IconButton
            aria-label="Scroll filters right"
            className="h-7 w-7"
            disabled={!fadeEnd}
            onClick={() => nudge(1)}
            variant="default"
          >
            <ChevronRightIcon height={14} width={14} />
          </IconButton>
        </div>
      ) : null}
    </Element>
  )
}
