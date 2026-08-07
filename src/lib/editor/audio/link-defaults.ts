import { LAYER_PROPERTY_BOUNDS } from "@/lib/editor/audio/modulate"
import type {
  AnimatedPropertyBinding,
  ParameterDefinition,
} from "@/types/editor"

export type AudioLinkRange = { outMax: number; outMin: number }

const UNIT_RANGE: AudioLinkRange = { outMax: 1, outMin: 0 }

export function resolveDefaultAudioLinkRange(
  binding: AnimatedPropertyBinding,
  definition: ParameterDefinition | null
): AudioLinkRange {
  if (binding.kind === "layer") {
    const bounds =
      binding.property === "visible"
        ? null
        : LAYER_PROPERTY_BOUNDS[binding.property]

    return bounds ? { outMax: bounds.max, outMin: bounds.min } : UNIT_RANGE
  }

  if (!definition || definition.type === "boolean") {
    return UNIT_RANGE
  }

  const min = "min" in definition ? definition.min : undefined
  const max = "max" in definition ? definition.max : undefined

  return { outMax: max ?? 1, outMin: min ?? 0 }
}
