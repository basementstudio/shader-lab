import type { CSSProperties } from "react"
import type { ShaderLabConfig } from "./types"

export interface ShaderLabCompositionProps {
  className?: string
  config: ShaderLabConfig
  style?: CSSProperties
}

export function ShaderLabComposition({
  className,
  config,
  style,
}: ShaderLabCompositionProps) {
  return (
    <div
      className={className}
      data-shader-lab-composition="true"
      style={{
        aspectRatio: `${config.composition.width} / ${config.composition.height}`,
        position: "relative",
        width: "100%",
        ...style,
      }}
    />
  )
}
