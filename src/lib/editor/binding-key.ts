import type { AnimatedPropertyBinding } from "@/types/editor"

/**
 * Stable identity for an animated/modulated property binding, for use as a map
 * key or dedupe key.
 *
 * Lives here rather than alongside the sidebar so pure lib modules (audio
 * modulation, timeline evaluation) can share it without importing component
 * code.
 */
export function getBindingKey(binding: AnimatedPropertyBinding): string {
  if (binding.kind === "layer") {
    return `layer:${binding.property}`
  }

  return `param:${binding.key}`
}

export function bindingEquals(
  left: AnimatedPropertyBinding,
  right: AnimatedPropertyBinding
): boolean {
  return getBindingKey(left) === getBindingKey(right)
}

/** Identity of a binding *on a specific layer*. */
export function getLayerBindingKey(
  layerId: string,
  binding: AnimatedPropertyBinding
): string {
  return `${layerId}:${getBindingKey(binding)}`
}
