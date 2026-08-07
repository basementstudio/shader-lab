import { describe, expect, test } from "bun:test"
import {
  CURRENT_PROJECT_FILE_VERSION,
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

  test("rejects a version newer than this build understands", () => {
    const fixture = {
      ...createValidProjectFile(),
      version: CURRENT_PROJECT_FILE_VERSION + 1,
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      "Unsupported Shader Lab project version."
    )
  })

  test("accepts the current version", () => {
    const fixture = {
      ...createValidProjectFile(),
      version: CURRENT_PROJECT_FILE_VERSION,
    }

    expect(parseLabProjectFile(JSON.stringify(fixture)).version).toBe(
      CURRENT_PROJECT_FILE_VERSION
    )
  })

  test("accepts a file with no audio block, as pre-audio versions have", () => {
    const fixture = createValidProjectFile()

    expect("audio" in fixture).toBe(false)
    expect(() => parseLabProjectFile(JSON.stringify(fixture))).not.toThrow()
  })

  test("round-trips an audio block", () => {
    const fixture = {
      ...createValidProjectFile(),
      audio: {
        bands: {
          bass: {
            attackMs: 8,
            gainDb: 3,
            highHz: 140,
            lowHz: 20,
            releaseMs: 140,
          },
        },
        links: [
          {
            band: "bass",
            binding: {
              key: "speed",
              kind: "param",
              label: "Speed",
              valueType: "number",
            },
            enabled: true,
            id: "link-1",
            layerId: "layer-1",
            outMax: 2,
            outMin: 0,
          },
        ],
        offsetSeconds: 12.5,
        source: { assetId: "asset-1", kind: "asset" },
      },
      version: CURRENT_PROJECT_FILE_VERSION,
    }

    const parsed = parseLabProjectFile(JSON.stringify(fixture))

    expect(parsed.audio?.offsetSeconds).toBe(12.5)
    expect(parsed.audio?.links).toHaveLength(1)
    expect(parsed.audio?.bands.bass?.gainDb).toBe(3)
  })

  test("a partial audio block does not reject the whole project", () => {
    const partials: unknown[] = [
      {},
      { offsetSeconds: 4 },
      { links: [] },
      { source: null },
      {
        links: [
          {
            band: "bass",
            binding: { key: "speed", kind: "param", label: "Speed", valueType: "number" },
            id: "link-1",
            layerId: "layer-1",
            outMax: 1,
            outMin: 0,
          },
        ],
      },
    ]

    for (const audio of partials) {
      const fixture = {
        ...createValidProjectFile(),
        audio,
        version: CURRENT_PROJECT_FILE_VERSION,
      }

      expect(() => parseLabProjectFile(JSON.stringify(fixture))).not.toThrow()
    }
  })

  test("a genuinely malformed audio block reports the audio, not the project", () => {
    const fixture = {
      ...createValidProjectFile(),
      audio: { offsetSeconds: "loud" },
      version: CURRENT_PROJECT_FILE_VERSION,
    }

    expect(() => parseLabProjectFile(JSON.stringify(fixture))).toThrow(
      /audio configuration/i
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
