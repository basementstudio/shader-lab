import { describe, expect, test } from "bun:test"
import { collectReferencedAssetIds } from "@/lib/editor/project-file"
import type { EditorAudioSnapshot, EditorLayer } from "@/types/editor"

function layerWith(assetId: string | null): EditorLayer {
  return { assetId, id: `layer-${assetId ?? "none"}` } as unknown as EditorLayer
}

type AudioSource = EditorAudioSnapshot["source"]

const noAudio = null as unknown as AudioSource

function audioAsset(assetId: string): AudioSource {
  return { assetId, kind: "asset" } as unknown as AudioSource
}

function audioLayer(layerId: string): AudioSource {
  return { kind: "layer", layerId } as unknown as AudioSource
}

describe("collectReferencedAssetIds", () => {
  test("keeps assets a layer points at", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: noAudio,
      layers: [layerWith("a"), layerWith("b")],
    })

    expect([...referenced].sort()).toEqual(["a", "b"])
  })

  test("ignores layers that carry no asset", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: noAudio,
      layers: [layerWith(null), layerWith("a")],
    })

    expect([...referenced]).toEqual(["a"])
  })

  test("keeps the audio track, which no layer points at", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: audioAsset("song"),
      layers: [layerWith("a")],
    })

    expect([...referenced].sort()).toEqual(["a", "song"])
  })

  test("audio driven by a layer contributes no asset id", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: audioLayer("layer-a"),
      layers: [layerWith("a")],
    })

    expect([...referenced]).toEqual(["a"])
  })

  test("an asset nothing points at is excluded", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: noAudio,
      layers: [layerWith("kept")],
    })

    expect(referenced.has("orphan")).toBe(false)
  })

  test("a scene with nothing in it references nothing", () => {
    expect(
      collectReferencedAssetIds({ audioSource: noAudio, layers: [] }).size
    ).toBe(0)
  })

  test("two layers sharing one asset yield it once", () => {
    const referenced = collectReferencedAssetIds({
      audioSource: noAudio,
      layers: [layerWith("shared"), layerWith("shared")],
    })

    expect([...referenced]).toEqual(["shared"])
  })
})
