type TextFontWeightConfig =
  | {
      kind: "fixed"
      weights: readonly number[]
    }
  | {
      kind: "range"
      max: number
      min: number
      step: number
    }

type TextFontDefinition = {
  cssVariable?: string
  defaultWeight: number
  fallback: string
  value: string
  weights: TextFontWeightConfig
}

const TEXT_FONT_DEFINITIONS = [
  {
    defaultWeight: 700,
    fallback: 'Georgia, "Times New Roman", serif',
    value: "display-serif",
    weights: {
      kind: "fixed",
      weights: [400, 700],
    },
  },
  {
    cssVariable: "--geist-sans",
    defaultWeight: 700,
    fallback: "Arial, sans-serif",
    value: "sans",
    weights: {
      kind: "range",
      max: 900,
      min: 100,
      step: 1,
    },
  },
  {
    cssVariable: "--geist-mono",
    defaultWeight: 400,
    fallback: "ui-monospace, monospace",
    value: "mono",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--adhesion",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "adhesion",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--blob",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "blob",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--bsmnt-grotesque",
    defaultWeight: 500,
    fallback: "Arial, sans-serif",
    value: "bsmnt-grotesque",
    weights: {
      kind: "range",
      max: 900,
      min: 400,
      step: 1,
    },
  },
  {
    cssVariable: "--bunker",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "bunker",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--caniche",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "caniche",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--carpenter",
    defaultWeight: 400,
    fallback: 'Georgia, "Times New Roman", serif',
    value: "carpenter",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--curia",
    defaultWeight: 400,
    fallback: 'Georgia, "Times New Roman", serif',
    value: "curia",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--ffflauta",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "ffflauta",
    weights: {
      kind: "fixed",
      weights: [100, 200, 300, 400],
    },
  },
  {
    cssVariable: "--numero",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "numero",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--xer0",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "xer0",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--trovador",
    defaultWeight: 400,
    fallback: "Georgia, serif",
    value: "trovador",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    cssVariable: "--b-mecha",
    defaultWeight: 400,
    fallback: "Arial, sans-serif",
    value: "b-mecha",
    weights: {
      kind: "fixed",
      weights: [400],
    },
  },
  {
    defaultWeight: 700,
    fallback: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    value: "impact",
    weights: {
      kind: "fixed",
      weights: [700],
    },
  },
] as const satisfies readonly TextFontDefinition[]

const DEFAULT_TEXT_FONT = TEXT_FONT_DEFINITIONS[0]

const textFontDefinitionByValue = new Map<string, TextFontDefinition>(
  TEXT_FONT_DEFINITIONS.map((definition) => {
    return [definition.value, definition] as [string, TextFontDefinition]
  })
)

function getTextFontDefinition(value: string): TextFontDefinition {
  return textFontDefinitionByValue.get(value) ?? DEFAULT_TEXT_FONT
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getClosestWeight(value: number, weights: readonly number[]): number {
  let closestWeight = weights[0] ?? DEFAULT_TEXT_FONT.defaultWeight
  let smallestDistance = Number.POSITIVE_INFINITY

  for (const weight of weights) {
    const distance = Math.abs(weight - value)

    if (distance < smallestDistance) {
      closestWeight = weight
      smallestDistance = distance
    }
  }

  return closestWeight
}

function getCssVariableFontFamily(cssVariable: string): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const fontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVariable)
    .trim()

  return fontFamily.length > 0 ? fontFamily : null
}

export function normalizeTextFontWeight(
  fontValue: string,
  value: unknown
): number {
  const definition = getTextFontDefinition(fontValue)
  const requestedWeight =
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : definition.defaultWeight

  if (definition.weights.kind === "range") {
    const clampedWeight = clamp(
      requestedWeight,
      definition.weights.min,
      definition.weights.max
    )

    return (
      definition.weights.min +
      Math.round(
        (clampedWeight - definition.weights.min) / definition.weights.step
      ) *
        definition.weights.step
    )
  }

  return getClosestWeight(requestedWeight, definition.weights.weights)
}

export function resolveTextFontFamily(value: string): string {
  const definition = getTextFontDefinition(value)

  if (definition.cssVariable) {
    const cssVariableFontFamily = getCssVariableFontFamily(
      definition.cssVariable
    )

    if (cssVariableFontFamily) {
      return `${cssVariableFontFamily}, ${definition.fallback}`
    }
  }

  return definition.fallback
}
