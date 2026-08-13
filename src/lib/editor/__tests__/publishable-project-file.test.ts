import { describe, expect, test } from "bun:test"
import {
  buildPublishableProjectFile,
  type LabProjectFile,
} from "@/lib/editor/project-file"
import type { EditorAudioSnapshot, EditorLayer } from "@/types/editor"

function layer(overrides: Partial<EditorLayer> = {}): EditorLayer {
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
    ...overrides,
  }
}

function audio(
  overrides: Partial<EditorAudioSnapshot> = {}
): EditorAudioSnapshot {
  return {
    bands: {} as EditorAudioSnapshot["bands"],
    links: [],
    offsetSeconds: 0,
    source: null,
    ...overrides,
  }
}

function projectFile(overrides: Partial<LabProjectFile> = {}): LabProjectFile {
  return {
    assets: [],
    composition: { height: 1080, width: 1920 },
    exportedAt: "2026-08-13T00:00:00.000Z",
    format: "shader-lab",
    layers: [],
    selectedLayerId: null,
    timeline: { duration: 6, loop: true, tracks: [] },
    version: 4,
    ...overrides,
  }
}

describe("buildPublishableProjectFile", () => {
  test("returns the very same object when nothing is hidden", () => {
    const file = projectFile({ layers: [layer()] })

    expect(buildPublishableProjectFile(file)).toBe(file)
  })

  test("drops hidden layers, whatever kind they are", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        layers: [
          layer({ id: "visible-source" }),
          layer({ id: "hidden-source", visible: false }),
          layer({ id: "hidden-effect", kind: "effect", visible: false }),
        ],
      })
    )

    expect(result.layers.map((entry) => entry.id)).toEqual(["visible-source"])
  })

  test("drops the media a hidden layer was the only user of", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        assets: [
          { fileName: "shown.png", id: "asset-shown", kind: "image" },
          { fileName: "hidden.mp4", id: "asset-hidden", kind: "video" },
        ],
        layers: [
          layer({ assetId: "asset-shown", id: "shown" }),
          layer({ assetId: "asset-hidden", id: "hidden", visible: false }),
        ],
      })
    )

    expect(result.assets.map((asset) => asset.id)).toEqual(["asset-shown"])
  })

  test("keeps media a visible layer still uses, even if a hidden layer shares it", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        assets: [{ fileName: "shared.mp4", id: "asset-shared", kind: "video" }],
        layers: [
          layer({ assetId: "asset-shared", id: "shown" }),
          layer({ assetId: "asset-shared", id: "hidden", visible: false }),
        ],
      })
    )

    expect(result.assets.map((asset) => asset.id)).toEqual(["asset-shared"])
  })

  test("keeps the audio track, which no layer points at", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        assets: [{ fileName: "song.mp3", id: "asset-audio", kind: "audio" }],
        audio: audio({ source: { assetId: "asset-audio", kind: "asset" } }),
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
      })
    )

    expect(result.assets.map((asset) => asset.id)).toEqual(["asset-audio"])
  })

  test("keeps a hidden layer the audio is driven by, since it is still in use", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        audio: audio({ source: { kind: "video-layer", layerId: "hidden" } }),
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
      })
    )

    expect(result.layers.map((entry) => entry.id)).toEqual(["shown", "hidden"])
  })

  test("prunes timeline tracks that pointed at a dropped layer", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
        timeline: {
          duration: 6,
          loop: true,
          tracks: [
            {
              binding: { kind: "property", property: "opacity" },
              enabled: true,
              id: "track-shown",
              keyframes: [],
              layerId: "shown",
            },
            {
              binding: { kind: "property", property: "opacity" },
              enabled: true,
              id: "track-hidden",
              keyframes: [],
              layerId: "hidden",
            },
          ],
        },
      })
    )

    expect(result.timeline.tracks.map((track) => track.id)).toEqual([
      "track-shown",
    ])
  })

  test("prunes audio links that pointed at a dropped layer", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        audio: audio({
          links: [
            {
              band: "bass",
              binding: { kind: "property", property: "opacity" },
              enabled: true,
              id: "link-shown",
              layerId: "shown",
              outMax: 1,
              outMin: 0,
            },
            {
              band: "bass",
              binding: { kind: "property", property: "opacity" },
              enabled: true,
              id: "link-hidden",
              layerId: "hidden",
              outMax: 1,
              outMin: 0,
            },
          ],
        }),
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
      })
    )

    expect(result.audio?.links.map((link) => link.id)).toEqual(["link-shown"])
  })

  test("clears a selection that pointed at a dropped layer", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
        selectedLayerId: "hidden",
      })
    )

    expect(result.selectedLayerId).toBeNull()
  })

  test("keeps a selection that survived", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        layers: [
          layer({ id: "shown" }),
          layer({ id: "hidden", visible: false }),
        ],
        selectedLayerId: "shown",
      })
    )

    expect(result.selectedLayerId).toBe("shown")
  })

  test("an all-hidden scene collapses to nothing, which publish refuses", () => {
    const result = buildPublishableProjectFile(
      projectFile({
        assets: [{ fileName: "a.png", id: "asset-a", kind: "image" }],
        layers: [
          layer({ assetId: "asset-a", id: "a", visible: false }),
          layer({ id: "b", visible: false }),
        ],
      })
    )

    expect(result.layers).toEqual([])
    expect(result.assets).toEqual([])
  })

  test("leaves the source project untouched", () => {
    const file = projectFile({
      layers: [layer({ id: "shown" }), layer({ id: "hidden", visible: false })],
    })

    buildPublishableProjectFile(file)

    expect(file.layers).toHaveLength(2)
  })
})
