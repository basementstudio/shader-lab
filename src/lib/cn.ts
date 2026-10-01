import { cx } from "class-variance-authority"
import type { ClassValue } from "class-variance-authority/types"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["icon", "group", "toolbar", "scene-thumb", "scene-card"],
      spacing: ["bar", "bar-group"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(cx(inputs))
}
