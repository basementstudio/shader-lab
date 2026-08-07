import type { AnimatedPropertyBinding } from "@/types/editor"

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

export function getLayerBindingKey(
  layerId: string,
  binding: AnimatedPropertyBinding
): string {
  return `${layerId}:${getBindingKey(binding)}`
}
