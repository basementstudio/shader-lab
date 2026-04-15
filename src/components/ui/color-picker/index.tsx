"use client"

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/cn"

type HsvColor = {
  h: number
  s: number
  v: number
}

type PopupPosition = {
  left: number
  top: number
}

type ColorPickerProps = {
  className?: string
  onInteractionEnd?: (() => void) | undefined
  onInteractionStart?: (() => void) | undefined
  onValueChange: (value: string) => void
  value: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHex(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "")

  if (/^[\da-fA-F]{3}$/.test(normalized)) {
    const expanded = normalized
      .split("")
      .map((entry) => `${entry}${entry}`)
      .join("")

    return `#${expanded.toUpperCase()}`
  }

  if (/^[\da-fA-F]{6}$/.test(normalized)) {
    return `#${normalized.toUpperCase()}`
  }

  return null
}

function hexToRgb(value: string): { b: number; g: number; r: number } {
  const hex = normalizeHex(value) ?? "#FFFFFF"
  return {
    b: Number.parseInt(hex.slice(5, 7), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    r: Number.parseInt(hex.slice(1, 3), 16),
  }
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")
    )
    .join("")
    .toUpperCase()}`
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6
    } else if (max === g) {
      h = (b - r) / delta + 2
    } else {
      h = (r - g) / delta + 4
    }
  }

  return {
    h: (h * 60 + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

function hsvToRgb(hue: number, saturation: number, value: number) {
  const chroma = value * saturation
  const huePrime = (((hue % 360) + 360) % 360) / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma
    green = x
  } else if (huePrime < 2) {
    red = x
    green = chroma
  } else if (huePrime < 3) {
    green = chroma
    blue = x
  } else if (huePrime < 4) {
    green = x
    blue = chroma
  } else if (huePrime < 5) {
    red = x
    blue = chroma
  } else {
    red = chroma
    blue = x
  }

  const match = value - chroma

  return {
    b: (blue + match) * 255,
    g: (green + match) * 255,
    r: (red + match) * 255,
  }
}

function colorFromHsv(color: HsvColor): string {
  const rgb = hsvToRgb(color.h, color.s, color.v)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function hueToHex(hue: number): string {
  const rgb = hsvToRgb(hue, 1, 1)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

export function ColorPicker({
  className,
  onInteractionEnd,
  onInteractionStart,
  onValueChange,
  value,
}: ColorPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const gestureActiveRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(normalizeHex(value) ?? "#FFFFFF")
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({
    left: 0,
    top: 0,
  })
  const [color, setColor] = useState(() => {
    const rgb = hexToRgb(value)
    return rgbToHsv(rgb.r, rgb.g, rgb.b)
  })

  useEffect(() => {
    const hex = normalizeHex(value) ?? "#FFFFFF"
    const rgb = hexToRgb(hex)
    setInputValue(hex)
    setColor(rgbToHsv(rgb.r, rgb.g, rgb.b))
  }, [value])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      setPopupPosition({
        left: rect.right - 208,
        top: rect.bottom + 8,
      })
    }

    const handlePointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current
      const surface = surfaceRef.current
      const hue = hueRef.current
      const target = event.target as Node | null

      if (
        trigger?.contains(target) ||
        surface?.contains(target) ||
        hue?.contains(target) ||
        (target instanceof HTMLElement &&
          target.closest("[data-color-picker-popup]"))
      ) {
        return
      }

      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
      }
    }

    updatePosition()
    window.requestAnimationFrame(() => {
      popupRef.current?.querySelector<HTMLInputElement>("input")?.focus()
    })
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  const hueColor = useMemo(() => hueToHex(color.h), [color.h])

  const commitColor = (nextColor: HsvColor) => {
    const nextHex = colorFromHsv(nextColor)
    setColor(nextColor)
    setInputValue(nextHex)
    onValueChange(nextHex)
  }

  const beginInteraction = () => {
    if (gestureActiveRef.current) {
      return
    }

    gestureActiveRef.current = true
    onInteractionStart?.()
  }

  const endInteraction = () => {
    if (!gestureActiveRef.current) {
      return
    }

    gestureActiveRef.current = false
    onInteractionEnd?.()
  }

  const updateSurface = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }

    const rect = surface.getBoundingClientRect()
    const saturation = clamp((clientX - rect.left) / rect.width, 0, 1)
    const valueLevel = 1 - clamp((clientY - rect.top) / rect.height, 0, 1)
    commitColor({ h: color.h, s: saturation, v: valueLevel })
  }

  const updateHue = (clientX: number) => {
    const hueElement = hueRef.current
    if (!hueElement) {
      return
    }

    const rect = hueElement.getBoundingClientRect()
    const hue = clamp((clientX - rect.left) / rect.width, 0, 1) * 360
    commitColor({ h: hue, s: color.s, v: color.v })
  }

  const handleSurfacePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    beginInteraction()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateSurface(event.clientX, event.clientY)
  }

  const handleSurfacePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (event.buttons !== 1) {
      return
    }

    updateSurface(event.clientX, event.clientY)
  }

  const handleHuePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    beginInteraction()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateHue(event.clientX)
  }

  const handleHuePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) {
      return
    }

    updateHue(event.clientX)
  }

  const popupStyle = {
    left: `${popupPosition.left}px`,
    position: "fixed",
    top: `${popupPosition.top}px`,
    zIndex: 80,
  } as CSSProperties

  return (
    <div className={cn("w-[132px]", className)}>
      <button
        className="grid min-h-8 w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)] items-center gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-2 pt-1 pr-2 pb-1 pl-1 text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-border-active)] data-[open]:bg-white/8 data-[open]:border-[var(--ds-border-active)]"
        data-open={isOpen ? "" : undefined}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span
          className="h-6 w-6 rounded-[var(--ds-radius-thumb)] border border-white/8 shadow-[inset_0_0_0_1px_rgb(0_0_0_/_0.12)]"
          style={{ backgroundColor: inputValue }}
        />
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left font-[var(--ds-font-mono)] text-[11px] leading-[14px] uppercase">
          {inputValue}
        </span>
      </button>

      {isOpen
        ? createPortal(
            <div data-color-picker-popup="" ref={popupRef} style={popupStyle}>
              <GlassPanel
                className="flex w-[208px] flex-col gap-3 p-3"
                variant="panel"
              >
                <div
                  className="relative h-[132px] w-full cursor-crosshair overflow-hidden rounded-[10px] select-none"
                  onPointerCancel={endInteraction}
                  onPointerDown={handleSurfacePointerDown}
                  onPointerMove={handleSurfacePointerMove}
                  onPointerUp={endInteraction}
                  ref={surfaceRef}
                  style={{ backgroundColor: hueColor }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,#fff,rgb(255_255_255_/_0%))]" />
                  <div className="absolute inset-0 bg-[linear-gradient(0deg,#000,rgb(0_0_0_/_0%))]" />
                  <div
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/95 shadow-[0_0_0_1px_rgb(0_0_0_/_0.35),0_2px_6px_rgb(0_0_0_/_0.3)]"
                    style={{
                      left: `${color.s * 100}%`,
                      top: `${(1 - color.v) * 100}%`,
                    }}
                  />
                </div>

                <div
                  className="relative h-3 w-full cursor-ew-resize rounded-full select-none bg-[linear-gradient(90deg,#ff0000_0%,#ffff00_16.66%,#00ff00_33.33%,#00ffff_50%,#0000ff_66.66%,#ff00ff_83.33%,#ff0000_100%)]"
                  onPointerCancel={endInteraction}
                  onPointerDown={handleHuePointerDown}
                  onPointerMove={handleHuePointerMove}
                  onPointerUp={endInteraction}
                  ref={hueRef}
                >
                  <div
                    className="absolute top-1/2 h-4 w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/96 shadow-[0_0_0_1px_rgb(0_0_0_/_0.28),0_1px_4px_rgb(0_0_0_/_0.3)]"
                    style={{ left: `${(color.h / 360) * 100}%` }}
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <input
                    className="min-h-[30px] w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-white/4 px-[10px] font-[var(--ds-font-mono)] text-[11px] leading-[14px] text-[var(--ds-color-text-secondary)] uppercase outline-none focus:border-[var(--ds-border-active)]"
                    onChange={(event) => {
                      beginInteraction()
                      const nextValue = event.target.value.toUpperCase()
                      setInputValue(nextValue)
                      const nextHex = normalizeHex(nextValue)
                      if (!nextHex) {
                        endInteraction()
                        return
                      }
                      const rgb = hexToRgb(nextHex)
                      setColor(rgbToHsv(rgb.r, rgb.g, rgb.b))
                      onValueChange(nextHex)
                      endInteraction()
                    }}
                    spellCheck={false}
                    type="text"
                    value={inputValue}
                  />
                  <span className="text-right font-[var(--ds-font-sans)] text-[10px] leading-3 text-[var(--ds-color-text-muted)] uppercase">
                    HEX
                  </span>
                </div>
              </GlassPanel>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
