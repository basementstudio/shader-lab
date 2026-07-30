import { describe, expect, test } from "bun:test"
import {
  inferFileAssetKind,
  isAudioFileName,
  isSvgFileName,
  isSvgMediaSource,
} from "@/lib/editor/media-file"

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array([0])], name, { type })
}

describe("isAudioFileName", () => {
  test("recognizes common audio extensions regardless of case", () => {
    expect(isAudioFileName("track.mp3")).toBe(true)
    expect(isAudioFileName("Track.WAV")).toBe(true)
    expect(isAudioFileName("loop.m4a")).toBe(true)
    expect(isAudioFileName("stem.flac")).toBe(true)
    expect(isAudioFileName("voice.opus")).toBe(true)
  })

  test("rejects non-audio names and nullish input", () => {
    expect(isAudioFileName("clip.mp4")).toBe(false)
    expect(isAudioFileName("photo.png")).toBe(false)
    expect(isAudioFileName(null)).toBe(false)
    expect(isAudioFileName(undefined)).toBe(false)
  })
})

describe("inferFileAssetKind", () => {
  test("infers audio from the mime type", () => {
    expect(inferFileAssetKind(makeFile("track.mp3", "audio/mpeg"))).toBe("audio")
    expect(inferFileAssetKind(makeFile("track.ogg", "audio/ogg"))).toBe("audio")
  })

  test("infers audio from the extension when the mime type is missing", () => {
    // Browsers frequently report an empty type for .m4a and .flac.
    expect(inferFileAssetKind(makeFile("track.m4a", ""))).toBe("audio")
    expect(inferFileAssetKind(makeFile("track.flac", ""))).toBe("audio")
  })

  test("keeps video containers as video even though they carry audio", () => {
    // Order matters: audio/* is checked after video/*, so an mp4 with an audio
    // track is still a video asset.
    expect(inferFileAssetKind(makeFile("clip.mp4", "video/mp4"))).toBe("video")
    expect(inferFileAssetKind(makeFile("clip.mov", ""))).toBe("video")
    expect(inferFileAssetKind(makeFile("clip.webm", "video/webm"))).toBe("video")
  })

  test("still infers the pre-existing kinds", () => {
    expect(inferFileAssetKind(makeFile("a.png", "image/png"))).toBe("image")
    expect(inferFileAssetKind(makeFile("a.svg", ""))).toBe("image")
    expect(inferFileAssetKind(makeFile("a.glb", ""))).toBe("model")
    expect(inferFileAssetKind(makeFile("a.gltf", "model/gltf+json"))).toBe(
      "model"
    )
  })

  test("returns null for unsupported files", () => {
    expect(inferFileAssetKind(makeFile("notes.txt", "text/plain"))).toBeNull()
  })
})

describe("svg helpers still behave", () => {
  test("detects svg by name and by media source", () => {
    expect(isSvgFileName("logo.SVG")).toBe(true)
    expect(isSvgMediaSource({ mimeType: "image/svg+xml" })).toBe(true)
    expect(isSvgMediaSource({ fileName: "logo.svg" })).toBe(true)
    expect(isSvgMediaSource({ fileName: "logo.png" })).toBe(false)
  })
})
