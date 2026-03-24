// Type augmentations and module declarations

// React CSS custom properties support
import "react"

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number
  }
}

// Global window extensions
declare global {
  interface Window {}
}
