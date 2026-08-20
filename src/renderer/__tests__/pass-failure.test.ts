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

describe("nextPassFailureState", () => {
  const run = (fingerprints: string[], max = 3) => {
    let state: PassFailureState | undefined
    return fingerprints.map((fingerprint) => {
      const decision = nextPassFailureState(state, fingerprint, max)
      state = decision.state
      return decision
    })
  }

  // The whole point: a pass throwing at 60fps must not send 60 events a second.
  test("reports the same failure once, however many frames repeat it", () => {
    const decisions = run(Array.from({ length: 60 }, () => "boom"))

    expect(decisions.filter((d) => d.report)).toHaveLength(1)
    expect(decisions[0]?.report).toBe(true)
  })

  test("disables the pass once it hits the limit, and stays disabled", () => {
    const decisions = run(Array.from({ length: 10 }, () => "boom"))

    expect(decisions.slice(0, 2).some((d) => d.disable)).toBe(false)
    expect(decisions[2]?.disable).toBe(true)
    expect(decisions.at(-1)?.disable).toBe(true)
  })

  test("a different failure reports again and restarts the count", () => {
    const decisions = run(["a", "a", "b"])

    expect(decisions[2]?.report).toBe(true)
    expect(decisions[2]?.state.count).toBe(1)
    expect(decisions[2]?.disable).toBe(false)
  })

  test("a cleared pass reports again", () => {
    expect(nextPassFailureState(undefined, "boom", 3).report).toBe(true)
  })
})
