import { describe, expect, test } from "bun:test"
import { classifyPassFailure } from "@/renderer/pass-failure"
import type { EditorLayer } from "@/types/editor"

// No module mocks here on purpose: bun's mock.module is global for the whole
// run, so mocking the layer store leaks into unrelated suites.
describe("classifyPassFailure", () => {
  test("custom-shader failures are contained, never captured", () => {
    expect(classifyPassFailure({ kind: "source", type: "custom-shader" })).toBe(
      "contain"
    )
  })

  test("built-in layers are captured", () => {
    const builtIns: EditorLayer["type"][] = [
      "crt",
      "image",
      "video",
      "gradient",
      "fluid",
      "text",
      "live",
    ]

    for (const type of builtIns) {
      expect(classifyPassFailure({ kind: "source", type })).toBe("capture")
    }
  })

  test("unknown layers are captured rather than silently contained", () => {
    expect(classifyPassFailure(undefined)).toBe("capture")
  })
})
