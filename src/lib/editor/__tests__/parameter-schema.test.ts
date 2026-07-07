import { describe, expect, test } from "bun:test"
import {
  buildParameterValues,
  cloneParameterValue,
  cloneParameterValues,
  isParameterValueEqual,
  parameterValuesSignature,
  valueSignature,
} from "@/lib/editor/parameter-schema"
import type {
  LayerParameterValues,
  ParameterDefinitions,
} from "@/types/editor"

describe("cloneParameterValue", () => {
  test("returns a new array instance for tuple values", () => {
    const original: [number, number] = [1, 2]
    const clone = cloneParameterValue(original)

    expect(clone).not.toBe(original)
    expect(clone).toEqual(original)
  })

  test("returns a new array instance for vec3 tuple values", () => {
    const original: [number, number, number] = [0.1, 0.2, 0.3]
    const clone = cloneParameterValue(original)

    expect(clone).not.toBe(original)
    expect(clone).toEqual(original)
  })

  test("passes primitives through unchanged", () => {
    expect(cloneParameterValue(4)).toBe(4)
    expect(cloneParameterValue("hello")).toBe("hello")
    expect(cloneParameterValue(true)).toBe(true)
    expect(cloneParameterValue(false)).toBe(false)
  })
})

describe("cloneParameterValues", () => {
  test("clones every entry", () => {
    const source: LayerParameterValues = {
      color: "#ff0000",
      offset: [3, 4],
      strength: 0.5,
    }
    const clone = cloneParameterValues(source)

    expect(clone).not.toBe(source)
    expect(clone).toEqual(source)
    expect(clone.offset).not.toBe(source.offset)
  })

  test("mutating a cloned array value does not affect the source", () => {
    const source: LayerParameterValues = {
      offset: [3, 4],
    }
    const clone = cloneParameterValues(source)
    const clonedOffset = clone.offset as [number, number]

    clonedOffset[0] = 99

    expect(source.offset).toEqual([3, 4])
  })
})

describe("buildParameterValues", () => {
  const definitions: ParameterDefinitions = [
    {
      defaultValue: 0.5,
      key: "strength",
      label: "Strength",
      type: "number",
    },
    {
      defaultValue: [1, 2],
      key: "offset",
      label: "Offset",
      type: "vec2",
    },
    {
      defaultValue: "#ffffff",
      key: "color",
      label: "Color",
      type: "color",
    },
  ]

  test("produces one entry per definition keyed by key", () => {
    const values = buildParameterValues(definitions)

    expect(Object.keys(values).sort()).toEqual(["color", "offset", "strength"])
    expect(values.strength).toBe(0.5)
    expect(values.color).toBe("#ffffff")
  })

  test("array defaults are equal to but not the same reference as the definition default", () => {
    const values = buildParameterValues(definitions)
    const offsetDefinition = definitions[1]

    expect(values.offset).toEqual([1, 2])
    expect(values.offset).not.toBe(offsetDefinition?.defaultValue)
  })
})

describe("isParameterValueEqual", () => {
  test("equal primitives", () => {
    expect(isParameterValueEqual(1, 1)).toBe(true)
    expect(isParameterValueEqual("a", "a")).toBe(true)
    expect(isParameterValueEqual(true, true)).toBe(true)
    expect(isParameterValueEqual(1, 2)).toBe(false)
  })

  test("equal tuples", () => {
    expect(isParameterValueEqual([1, 2], [1, 2])).toBe(true)
    expect(isParameterValueEqual([1, 2, 3], [1, 2, 3])).toBe(true)
  })

  test("unequal tuples", () => {
    expect(isParameterValueEqual([1, 2], [1, 3])).toBe(false)
    expect(isParameterValueEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  test("tuple vs primitive", () => {
    expect(isParameterValueEqual([1, 2], 1)).toBe(false)
    expect(isParameterValueEqual(1, [1, 2])).toBe(false)
  })
})

describe("valueSignature", () => {
  test("is stable for equal inputs", () => {
    expect(valueSignature(0.5)).toBe(valueSignature(0.5))
    expect(valueSignature([1, 2])).toBe(valueSignature([1, 2]))
    expect(valueSignature("#fff")).toBe(valueSignature("#fff"))
  })

  test("differs for different inputs", () => {
    expect(valueSignature(0.5)).not.toBe(valueSignature(0.6))
    expect(valueSignature([1, 2])).not.toBe(valueSignature([2, 1]))
    expect(valueSignature(true)).not.toBe(valueSignature(false))
  })
})

describe("parameterValuesSignature", () => {
  test("is stable for equal inputs", () => {
    const left: LayerParameterValues = { offset: [1, 2], strength: 0.5 }
    const right: LayerParameterValues = { offset: [1, 2], strength: 0.5 }

    expect(parameterValuesSignature(left)).toBe(
      parameterValuesSignature(right)
    )
  })

  test("differs for different inputs", () => {
    const left: LayerParameterValues = { offset: [1, 2], strength: 0.5 }
    const right: LayerParameterValues = { offset: [1, 2], strength: 0.6 }

    expect(parameterValuesSignature(left)).not.toBe(
      parameterValuesSignature(right)
    )
  })

  test("does not depend on key insertion order", () => {
    const ordered: LayerParameterValues = { alpha: 1, beta: 2 }
    const reversed: LayerParameterValues = { beta: 2, alpha: 1 }

    expect(parameterValuesSignature(ordered)).toBe(
      parameterValuesSignature(reversed)
    )
  })
})
