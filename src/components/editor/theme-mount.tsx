"use client"

import { useEffect } from "react"
import { useThemeStore } from "@/store/theme-store"

export function ThemeMount() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute("content") ?? null
    meta?.setAttribute(
      "content",
      getComputedStyle(root).getPropertyValue("--ds-color-canvas").trim()
    )
    return () => {
      delete root.dataset.theme
      if (meta && previousColor !== null) {
        meta.setAttribute("content", previousColor)
      }
    }
  }, [theme])

  return null
}
