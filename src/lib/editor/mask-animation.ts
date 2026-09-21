import type {
  LayerMask,
  LayerMaskShape,
  LayerParameterValues,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"

export const MASK_PARAM_PREFIX = "mask."

export const MASK_ANIMATABLE_FIELDS = [
  "center",
  "size",
  "rotation",
  "feather",
] as const

export type MaskAnimatableField = (typeof MASK_ANIMATABLE_FIELDS)[number]

export function isMaskParamKey(key: string): boolean {
  return (
    key.startsWith(MASK_PARAM_PREFIX) &&
    MASK_ANIMATABLE_FIELDS.includes(
      key.slice(MASK_PARAM_PREFIX.length) as MaskAnimatableField
    )
  )
}

export function maskParamKey(field: MaskAnimatableField): string {
  return `${MASK_PARAM_PREFIX}${field}`
}

export function maskFieldOf(key: string): MaskAnimatableField | null {
  return isMaskParamKey(key)
    ? (key.slice(MASK_PARAM_PREFIX.length) as MaskAnimatableField)
    : null
}

const definitionsByShape = new Map<LayerMaskShape, ParameterDefinition[]>()

export function getMaskParameterDefinitions(
  shape: LayerMaskShape
): ParameterDefinition[] {
  const cached = definitionsByShape.get(shape)

  if (cached) {
    return cached
  }

  let definitions: ParameterDefinition[]

  if (shape === "none" || shape === "brush") {
    definitions = []
  } else if (shape === "depth") {
    definitions = [
      {
        defaultValue: [0.4, 1],
        group: "Mask",
        key: maskParamKey("size"),
        label: "Mask Near / Far",
        max: 1,
        min: 0,
        step: 0.01,
        type: "vec2",
      },
      {
        defaultValue: 0.05,
        group: "Mask",
        key: maskParamKey("feather"),
        label: "Mask Feather",
        max: 0.5,
        min: 0,
        step: 0.005,
        type: "number",
      },
    ]
  } else {
    definitions = [
      {
        defaultValue: [0, 0],
        group: "Mask",
        key: maskParamKey("center"),
        label: "Mask Center",
        max: 1,
        min: -1,
        step: 0.005,
        type: "vec2",
      },
      {
        defaultValue: [0.5, 0.5],
        group: "Mask",
        key: maskParamKey("size"),
        label: "Mask Size",
        max: 3,
        min: 0.01,
        step: 0.01,
        type: "vec2",
      },
      {
        defaultValue: 0,
        group: "Mask",
        key: maskParamKey("rotation"),
        label: "Mask Rotation",
        max: 180,
        min: -180,
        step: 1,
        type: "number",
        unit: "°",
      },
      ...(shape === "ellipse" || shape === "rectangle"
        ? [
            {
              defaultValue: 0.01,
              group: "Mask",
              key: maskParamKey("feather"),
              label: "Mask Feather",
              max: 0.25,
              min: 0,
              step: 0.005,
              type: "number",
            } satisfies ParameterDefinition,
          ]
        : []),
    ]
  }

  definitionsByShape.set(shape, definitions)
  return definitions
}

export function getMaskParameterDefinition(
  shape: LayerMaskShape,
  key: string
): ParameterDefinition | null {
  return (
    getMaskParameterDefinitions(shape).find(
      (definition) => definition.key === key
    ) ?? null
  )
}

function isPair(value: ParameterValue | undefined): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  )
}

export function applyMaskOverrides<T extends Partial<LayerMask> | null>(
  mask: T,
  params: LayerParameterValues
): T {
  if (!mask) {
    return mask
  }

  let next: Partial<LayerMask> | null = null

  for (const field of MASK_ANIMATABLE_FIELDS) {
    const value = params[maskParamKey(field)]

    if (value === undefined) {
      continue
    }

    if ((field === "center" || field === "size") && isPair(value)) {
      next ??= { ...mask }
      next[field] = [value[0], value[1]]
    } else if (
      (field === "rotation" || field === "feather") &&
      typeof value === "number"
    ) {
      next ??= { ...mask }
      next[field] = value
    }
  }

  return (next ?? mask) as T
}

export function stripMaskParams(
  params: LayerParameterValues
): LayerParameterValues {
  let stripped: LayerParameterValues | null = null

  for (const key of Object.keys(params)) {
    if (isMaskParamKey(key)) {
      stripped ??= { ...params }
      delete stripped[key]
    }
  }

  return stripped ?? params
}
