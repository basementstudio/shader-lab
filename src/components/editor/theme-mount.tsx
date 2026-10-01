"use client"

import { useEffect } from "react"
import { useThemeStore } from "@/store/theme-store"

const THEME_COLORS = { dark: "#080808", light: "#e9e9eb" } as const

export function ThemeMount() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLORS[theme])
    return () => {
      delete root.dataset.theme
    }
  }, [theme])

  return null
}
