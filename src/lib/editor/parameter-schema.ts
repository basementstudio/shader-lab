import type {
  LayerParameterValues,
  ParameterDefinition,
  ParameterDefinitions,
  ParameterValue,
} from "@/types/editor"

export function cloneParameterValue(value: ParameterValue): ParameterValue {
  if (Array.isArray(value)) {
    return [...value] as ParameterValue
  }

  return value
}

export function cloneParameterValues(values: LayerParameterValues): LayerParameterValues {
  const next: LayerParameterValues = {}

  for (const [key, value] of Object.entries(values)) {
    next[key] = cloneParameterValue(value)
  }

  return next
}

export function buildParameterValues(definitions: ParameterDefinitions): LayerParameterValues {
  const values: LayerParameterValues = {}

  for (const definition of definitions) {
    values[definition.key] = cloneParameterValue(definition.defaultValue)
  }

  return values
}

export function getParameterDefinition(
  definitions: ParameterDefinitions,
  key: string,
): ParameterDefinition | null {
  return definitions.find((definition) => definition.key === key) ?? null
}

export function isParameterAnimatable(definition: ParameterDefinition): boolean {
  if (definition.type === "text") {
    return false
  }

  return definition.animatable ?? true
}

export function isParameterValueEqual(left: ParameterValue, right: ParameterValue): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => entry === right[index])
    )
  }

  return left === right
}

export function valueSignature(value: ParameterValue): string {
  if (Array.isArray(value)) {
    return `[${value.join(",")}]`
  }

  return String(value)
}

export function parameterValuesSignature(values: LayerParameterValues): string {
  return Object.entries(values)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${valueSignature(value)}`)
    .join("|")
}
