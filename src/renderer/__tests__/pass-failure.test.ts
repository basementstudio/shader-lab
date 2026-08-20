import { describe, expect, test } from "bun:test"
import {
  classifyPassFailure,
  nextPassFailureState,
  type PassFailureState,
} from "@/renderer/pass-failure"
import type { EditorLayer } from "@/types/editor"

// No module mocks here on purpose: bun's mock.module is global for the whole
// run, so mocking the layer store leaks into unrelated suites.
describe("classifyPassFailure", () => {
  test("custom-shader failures are contained, never captured", () => {
    expect(classifyPassFailure("custom-shader")).toBe("contain")
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
      expect(classifyPassFailure(type)).toBe("capture")
    }
  })

  test("unknown layers are captured rather than silently contained", () => {
    expect(classifyPassFailure(undefined)).toBe("capture")
  })
})

describe("nextPassFailureState", () => {
  const run = (fingerprints: string[]) => {
    let state: PassFailureState | undefined
    return fingerprints.map((fingerprint) => {
      state = nextPassFailureState(state, fingerprint)
      return state
    })
  }

  // The whole point: callers report only on count === 1, so a pass throwing at
  // 60fps sends one event, not sixty.
  test("counts repeats of the same failure so only the first reports", () => {
    const states = run(Array.from({ length: 60 }, () => "boom"))

    expect(states.filter((s) => s.count === 1)).toHaveLength(1)
    expect(states[0]?.count).toBe(1)
    expect(states.at(-1)?.count).toBe(60)
  })

  test("a different failure restarts the count, so it reports again", () => {
    const states = run(["a", "a", "b"])

    expect(states[1]?.count).toBe(2)
    expect(states[2]?.count).toBe(1)
  })

  test("a cleared pass starts over", () => {
    expect(nextPassFailureState(undefined, "boom").count).toBe(1)
  })
})
