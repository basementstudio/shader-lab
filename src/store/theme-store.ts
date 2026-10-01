"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type EditorTheme = "dark" | "light"

export const EDITOR_THEME_STORAGE_KEY = "shader-lab-theme"

export interface ThemeStore {
  theme: EditorTheme
  setTheme: (theme: EditorTheme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: EDITOR_THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
