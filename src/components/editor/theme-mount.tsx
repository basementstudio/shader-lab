"use client"

import { useEffect } from "react"
import { useThemeStore } from "@/store/theme-store"

export function ThemeMount() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        getComputedStyle(root).getPropertyValue("--ds-color-canvas").trim()
      )
    return () => {
      delete root.dataset.theme
    }
  }, [theme])

  return null
}
