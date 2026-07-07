import { describe, expect, test } from "bun:test"
import {
  type LabProjectFile,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import type { EditorLayer } from "@/types/editor"

function createValidProjectFile(): LabProjectFile {
  return {
    assets: [],
    composition: { height: 1080, width: 1920 },
    exportedAt: "2026-06-10T00:00:00.000Z",
    format: "shader-lab",
    layers: [],
    selectedLayerId: null,
    timeline: { duration: 6, loop: true, tracks: [] },
    version: 2,
  }
}

function createValidLayer(): EditorLayer {
  return {
    assetId: null,
    blendMode: "normal",
    compositeMode: "filter",
    expanded: true,
    hue: 0,
    id: "layer-1",
    kind: "source",
    locked: false,
    maskConfig: { invert: false, mode: "multiply", source: "luminance" },
    name: "Gradient",
    opacity: 1,
    params: { speed: 1 },
    runtimeError: null,
    saturation: 1,
    type: "gradient",
    visible: true,
  }
}

describe("parseLabProjectFile", () => {
  test("parses a valid v2 project file", () => {
    const fixture = createValidProjectFile()
    const parsed = parseLabProjectFile(JSON.stringify(fixture))

    expect(parsed).toEqual(fixture)
  })

  test("returns a clone that is independent of later parses", () => {
    const input = JSON.stringify(createValidProjectFile())
    const first = parseLabProjectFile(input)

    first.timeline.duration = 999
    first.layers.push({} as never)

    const second = parseLabProjectFile(input)

    expect(second.timeline.duration).toBe(6)
    expect(second.layers).toEqual([])
  })

  test("rejects input that is not valid JSON", () => {
    expect(() => parseLabProjectFile("not json {")).toThrow(
      "The selected file is not valid JSON."
    )
  })

  test("rejects JSON that is not an object", () => {
    expect(() => parseLabProjectFile("null")).toThrow(
      "The selected file is not a valid Shader Lab project."
    )
  })

  test("rejects a file with the wrong format marker", () => {
    const fixture = { ...createValidProjectFile(), format: "other" }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "This file is not a Shader Lab `.lab` project."
    )
  })

  test("rejects an unsupported version", () => {
    const fixture = { ...createValidProjectFile(), version: 3 }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Unsupported Shader Lab project version."
    )
  })

  test("accepts version 1", () => {
    const fixture = { ...createValidProjectFile(), version: 1 }

    expect(parseLabProjectFile(JSON.stringify(fixture)).version).toBe(1)
  })

  test("rejects a non-array layer stack", () => {
    const fixture = { ...createValidProjectFile(), layers: "nope" }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing a valid layer stack."
    )
  })

  test("rejects missing timeline data", () => {
    const { timeline: _timeline, ...fixture } = createValidProjectFile()

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing timeline data."
    )
  })

  test("rejects a timeline without a tracks array", () => {
    const fixture = {
      ...createValidProjectFile(),
      timeline: { duration: 6, loop: true },
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing valid timeline tracks."
    )
  })

  test("rejects a composition without a height", () => {
    const fixture = {
      ...createValidProjectFile(),
      composition: { width: 1920 },
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing composition dimensions."
    )
  })

  test("rejects a layer entry that is not an object", () => {
    const fixture = { ...createValidProjectFile(), layers: ["nope"] }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing a valid layer stack."
    )
  })

  test("rejects a non-finite composition dimension", () => {
    const fixture = {
      ...createValidProjectFile(),
      composition: { height: 1080, width: Number.POSITIVE_INFINITY },
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing composition dimensions."
    )
  })

  test("rejects a timeline duration that is not a number", () => {
    const fixture = {
      ...createValidProjectFile(),
      timeline: { duration: "6", loop: true, tracks: [] },
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Project file is missing timeline data."
    )
  })

  test("preserves unknown extra keys in a layer's params", () => {
    const layer = createValidLayer()
    layer.params = { ...layer.params, futureParam: "kept" }
    const fixture = { ...createValidProjectFile(), layers: [layer] }

    const parsed = parseLabProjectFile(JSON.stringify(fixture))

    expect(parsed.layers).toHaveLength(1)
    expect(parsed.layers[0]?.params).toEqual({ futureParam: "kept", speed: 1 })
  })
})
