import { cx } from "class-variance-authority"
import type { ClassValue } from "class-variance-authority/types"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(cx(inputs))
}
