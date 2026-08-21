import { describe, expect, test } from "bun:test"
import {
  describeUploadLimit,
  formatBytes,
  MAX_ASSET_BYTES,
  MAX_IMAGE_BYTES,
  maxBytesForMimeType,
} from "@/lib/community/upload-limits"

const MB = 1024 * 1024

describe("maxBytesForMimeType", () => {
  test("images get the tight limit", () => {
    for (const mimeType of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ]) {
      expect(maxBytesForMimeType(mimeType)).toBe(MAX_IMAGE_BYTES)
    }
  })

  test("video, audio and models keep the loose limit", () => {
    for (const mimeType of [
      "video/mp4",
      "video/quicktime",
      "audio/wav",
      "model/gltf-binary",
    ]) {
      expect(maxBytesForMimeType(mimeType)).toBe(MAX_ASSET_BYTES)
    }
  })

  test("the image limit is 4 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(4 * MB)
  })

  test("the asset limit is 20 MB", () => {
    expect(MAX_ASSET_BYTES).toBe(20 * MB)
  })
})

describe("describeUploadLimit", () => {
  test("passes an image at exactly the limit", () => {
    expect(
      describeUploadLimit({ mimeType: "image/png", sizeBytes: 4 * MB })
    ).toBeNull()
  })

  test("rejects an image one byte over, and names the file and both sizes", () => {
    expect(
      describeUploadLimit({
        fileName: "poster.png",
        mimeType: "image/png",
        sizeBytes: 4 * MB + 1,
      })
    ).toBe('Images must be 4.0 MB or smaller, and "poster.png" is 4.0 MB.')
  })

  test("reports a genuinely heavy image in readable units", () => {
    expect(
      describeUploadLimit({
        fileName: "scan.png",
        mimeType: "image/png",
        sizeBytes: 37 * MB,
      })
    ).toBe('Images must be 4.0 MB or smaller, and "scan.png" is 37 MB.')
  })

  test("lets a video through at a size that would fail as an image", () => {
    expect(
      describeUploadLimit({ mimeType: "video/mp4", sizeBytes: 12 * MB })
    ).toBeNull()
  })

  test("still caps video at the loose limit", () => {
    expect(
      describeUploadLimit({ mimeType: "video/mp4", sizeBytes: 21 * MB })
    ).toBe("Files must be 20 MB or smaller, and One of the files is 21 MB.")
  })

  test("rejects an empty or negative length, so a forged presign cannot skip the check", () => {
    for (const sizeBytes of [0, -1, Number.NaN]) {
      expect(describeUploadLimit({ mimeType: "image/png", sizeBytes })).toBe(
        "One of the files is empty."
      )
    }
  })

  test("falls back to a generic subject when no file name is known", () => {
    expect(
      describeUploadLimit({
        fileName: null,
        mimeType: "image/png",
        sizeBytes: 9 * MB,
      })
    ).toBe(
      "Images must be 4.0 MB or smaller, and One of the files is 9.0 MB."
    )
  })
})

describe("formatBytes", () => {
  test("keeps a decimal below 10 MB and rounds above it", () => {
    expect(formatBytes(4 * MB)).toBe("4.0 MB")
    expect(formatBytes(1.25 * MB)).toBe("1.3 MB")
    expect(formatBytes(37.4 * MB)).toBe("37 MB")
  })

  test("never renders a negative or non-finite size", () => {
    expect(formatBytes(0)).toBe("0 MB")
    expect(formatBytes(-5)).toBe("0 MB")
    expect(formatBytes(Number.NaN)).toBe("0 MB")
  })
})
