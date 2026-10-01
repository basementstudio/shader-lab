"use client"

import { MoonIcon, SunIcon } from "@radix-ui/react-icons"
import { IconButton } from "@/components/ui/icon-button"
import { playUISound } from "@/lib/audio/shader-lab-sounds"
import { useThemeStore } from "@/store/theme-store"

export function ThemeToggleButton({ mobile = false }: { mobile?: boolean }) {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  return (
    <IconButton
      aria-label={theme === "light" ? "Dark theme" : "Light theme"}
      className={mobile ? "size-full min-h-11" : "h-7 w-7"}
      onClick={() => {
        toggleTheme()
        playUISound("action.panelSwitch")
      }}
      tooltipSide="bottom"
      uiSound="none"
      variant="default"
    >
      {theme === "light" ? (
        <MoonIcon height={15} width={15} />
      ) : (
        <SunIcon height={15} width={15} />
      )}
    </IconButton>
  )
}
