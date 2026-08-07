import { describe, expect, test } from "bun:test"
import {
  EXPORT_AUDIO_SAMPLE_RATE,
  getEncoderPrimingSeconds,
  MAX_EXPORT_AUDIO_SEGMENTS,
  planExportAudioSegments,
} from "@/lib/editor/audio/export-audio"

const base = {
  durationSeconds: 10,
  loop: false,
  offsetSeconds: 0,
  sourceDurationSeconds: 130,
  startSeconds: 0,
  timelineDurationSeconds: 10,
}

describe("getEncoderPrimingSeconds", () => {
  test("compensates AAC-LC priming, which mp4-muxer writes no edit list for", () => {
    expect(getEncoderPrimingSeconds("aac")).toBeCloseTo(
      2048 / EXPORT_AUDIO_SAMPLE_RATE,
      9
    )
  })

  test("leaves Opus alone, since webm-muxer writes the pre-skip", () => {
    expect(getEncoderPrimingSeconds("opus")).toBe(0)
  })
})

describe("planExportAudioSegments", () => {
  test("maps a whole timeline to one contiguous run", () => {
    expect(planExportAudioSegments(base)).toEqual([
      { durationSeconds: 10, outputStartSeconds: 0, sourceStartSeconds: 0 },
    ])
  })

  test("honours the export start time", () => {
    expect(
      planExportAudioSegments({
        ...base,
        durationSeconds: 4,
        startSeconds: 3,
      })
    ).toEqual([
      { durationSeconds: 4, outputStartSeconds: 0, sourceStartSeconds: 3 },
    ])
  })

  test("shifts by the audio offset, matching how envelopes are sampled", () => {
    expect(
      planExportAudioSegments({ ...base, offsetSeconds: 30 })
    ).toEqual([
      { durationSeconds: 10, outputStartSeconds: 0, sourceStartSeconds: 30 },
    ])
  })

  test("a negative offset leads with silence instead of shifting audio early", () => {
    expect(
      planExportAudioSegments({ ...base, offsetSeconds: -4 })
    ).toEqual([
      { durationSeconds: 6, outputStartSeconds: 4, sourceStartSeconds: 0 },
    ])
  })

  test("clamps a non-looping export to the timeline end", () => {
    expect(
      planExportAudioSegments({
        ...base,
        durationSeconds: 25,
        timelineDurationSeconds: 10,
      })
    ).toEqual([
      { durationSeconds: 10, outputStartSeconds: 0, sourceStartSeconds: 0 },
    ])
  })

  test("splits a looping export at each wrap, mirroring the frame loop", () => {
    expect(
      planExportAudioSegments({
        ...base,
        durationSeconds: 25,
        loop: true,
        timelineDurationSeconds: 10,
      })
    ).toEqual([
      { durationSeconds: 10, outputStartSeconds: 0, sourceStartSeconds: 0 },
      { durationSeconds: 10, outputStartSeconds: 10, sourceStartSeconds: 0 },
      { durationSeconds: 5, outputStartSeconds: 20, sourceStartSeconds: 0 },
    ])
  })

  test("a looping export starting mid-timeline wraps to zero", () => {
    expect(
      planExportAudioSegments({
        ...base,
        durationSeconds: 8,
        loop: true,
        startSeconds: 6,
        timelineDurationSeconds: 10,
      })
    ).toEqual([
      { durationSeconds: 4, outputStartSeconds: 0, sourceStartSeconds: 6 },
      { durationSeconds: 4, outputStartSeconds: 4, sourceStartSeconds: 0 },
    ])
  })

  test("truncates at the end of a track shorter than the timeline", () => {
    expect(
      planExportAudioSegments({
        ...base,
        durationSeconds: 10,
        sourceDurationSeconds: 6.5,
      })
    ).toEqual([
      { durationSeconds: 6.5, outputStartSeconds: 0, sourceStartSeconds: 0 },
    ])
  })

  test("drops a range that starts past the end of the track", () => {
    expect(
      planExportAudioSegments({ ...base, offsetSeconds: 200 })
    ).toEqual([])
  })

  test("returns nothing for degenerate input rather than throwing", () => {
    expect(planExportAudioSegments({ ...base, durationSeconds: 0 })).toEqual([])
    expect(
      planExportAudioSegments({ ...base, sourceDurationSeconds: 0 })
    ).toEqual([])
    expect(
      planExportAudioSegments({ ...base, timelineDurationSeconds: 0 })
    ).toEqual([])
  })

  test("output offsets stay gapless across a looped export", () => {
    const segments = planExportAudioSegments({
      ...base,
      durationSeconds: 47,
      loop: true,
      startSeconds: 2.5,
      timelineDurationSeconds: 7,
    })

    let expectedStart = 0
    for (const segment of segments) {
      expect(segment.outputStartSeconds).toBeCloseTo(expectedStart, 9)
      expectedStart += segment.durationSeconds
    }
    expect(expectedStart).toBeCloseTo(47, 9)
  })

  test("an encoder priming shift trades the leading frames for alignment", () => {
    const priming = getEncoderPrimingSeconds("aac")

    expect(
      planExportAudioSegments({ ...base, startSeconds: priming })
    ).toEqual([
      {
        durationSeconds: 10 - priming,
        outputStartSeconds: 0,
        sourceStartSeconds: priming,
      },
    ])
  })

  test("refuses an absurd number of loop passes instead of hanging", () => {
    expect(() =>
      planExportAudioSegments({
        ...base,
        durationSeconds: MAX_EXPORT_AUDIO_SEGMENTS * 2,
        loop: true,
        timelineDurationSeconds: 1,
      })
    ).toThrow(/more than 512 passes/)
  })
})
