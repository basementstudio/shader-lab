import { describe, expect, test } from "bun:test"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import type { ParameterDefinition } from "@/types/editor"
import { createParamTimelineBinding } from "../properties-sidebar-utils"

function findParam(
  type: Parameters<typeof getLayerDefinition>[0],
  predicate: (entry: ParameterDefinition) => boolean
): ParameterDefinition {
  const found = getLayerDefinition(type).params.find(predicate)

  if (!found) {
    throw new Error(`no matching param on ${type}`)
  }

  return found
}

describe("createParamTimelineBinding", () => {
  const animatable = findParam("crt", (entry) => entry.type === "number")
  const text = findParam(
    "custom-shader",
    (entry) => entry.type === "text"
  )

  test("describes an animatable param", () => {
    expect(createParamTimelineBinding(animatable)).toEqual({
      key: animatable.key,
      kind: "param",
      label: animatable.label,
      valueType: "number",
    })
  })

  test("returns null for a param that cannot be keyframed", () => {
    expect(createParamTimelineBinding(text)).toBeNull()
  })

  test("returns a stable reference so memoised fields are not defeated", () => {
    expect(createParamTimelineBinding(animatable)).toBe(
      createParamTimelineBinding(animatable)
    )
  })

  test("caches the null result too, not just the hits", () => {
    expect(createParamTimelineBinding(text)).toBe(
      createParamTimelineBinding(text)
    )
  })

  test("keeps separate entries per definition", () => {
    const other = findParam(
      "crt",
      (entry) => entry.type === "number" && entry.key !== animatable.key
    )

    expect(createParamTimelineBinding(animatable)).not.toBe(
      createParamTimelineBinding(other)
    )
  })
})
