import { describe, expect, test } from "bun:test"
import {
  estimateVideoExportBytes,
  STREAM_TO_DISK_THRESHOLD_BYTES,
} from "@/lib/editor/export"

const MB = 1024 * 1024

function megabytes(quality: "draft" | "standard" | "high" | "ultra", seconds: number) {
  return Math.round(estimateVideoExportBytes(quality, seconds) / MB)
}

describe("estimateVideoExportBytes", () => {
  test("scales with bitrate and duration", () => {
    expect(megabytes("draft", 10)).toBe(7)
    expect(megabytes("standard", 10)).toBe(12)
    expect(megabytes("high", 10)).toBe(19)
    expect(megabytes("ultra", 10)).toBe(33)
  })

  test("survives junk input rather than producing NaN", () => {
    expect(estimateVideoExportBytes("standard", Number.NaN)).toBe(0)
    expect(estimateVideoExportBytes("standard", -10)).toBe(0)
  })
})

describe("stream-to-disk threshold", () => {
  const overThreshold = (
    quality: "draft" | "standard" | "high" | "ultra",
    seconds: number
  ) => estimateVideoExportBytes(quality, seconds) > STREAM_TO_DISK_THRESHOLD_BYTES

  test("short exports stay on the in-memory download path", () => {
    expect(overThreshold("draft", 10)).toBe(false)
    expect(overThreshold("ultra", 10)).toBe(false)
    expect(overThreshold("standard", 60)).toBe(false)
  })

  test("a full song streams, which is the case that used to kill the tab", () => {
    expect(overThreshold("ultra", 303)).toBe(true)
    expect(overThreshold("high", 303)).toBe(true)
    expect(overThreshold("standard", 303)).toBe(true)
  })

  test("even the worst in-memory export left under the threshold fits in RAM", () => {
    expect(STREAM_TO_DISK_THRESHOLD_BYTES * 2).toBeLessThan(1024 * MB)
  })
})
