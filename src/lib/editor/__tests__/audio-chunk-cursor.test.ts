import { describe, expect, test } from "bun:test"
import { advanceAudioChunkCursor } from "@/lib/editor/export"

function chunksAt(timestamps: number[]) {
  return timestamps.map((timestamp) => ({ chunk: { timestamp } }))
}

describe("advanceAudioChunkCursor", () => {
  const chunks = chunksAt([0, 1000, 2000, 3000, 4000])

  test("takes every chunk at or before the timestamp", () => {
    expect(advanceAudioChunkCursor(chunks, 0, 2000)).toBe(3)
  })

  test("takes nothing when the next chunk is still ahead", () => {
    expect(advanceAudioChunkCursor(chunks, 3, 2500)).toBe(3)
  })

  test("never moves backwards", () => {
    expect(advanceAudioChunkCursor(chunks, 4, 0)).toBe(4)
  })

  test("a final infinite drain takes the whole tail", () => {
    expect(
      advanceAudioChunkCursor(chunks, 2, Number.POSITIVE_INFINITY)
    ).toBe(chunks.length)
  })

  test("walking frame by frame emits each chunk exactly once", () => {
    const emitted: number[] = []
    let cursor = 0

    for (let frameEndUs = 0; frameEndUs <= 5000; frameEndUs += 500) {
      const next = advanceAudioChunkCursor(chunks, cursor, frameEndUs)

      for (let index = cursor; index < next; index += 1) {
        emitted.push(chunks[index]?.chunk.timestamp ?? -1)
      }

      cursor = next
    }

    const final = advanceAudioChunkCursor(
      chunks,
      cursor,
      Number.POSITIVE_INFINITY
    )
    for (let index = cursor; index < final; index += 1) {
      emitted.push(chunks[index]?.chunk.timestamp ?? -1)
    }

    expect(emitted).toEqual([0, 1000, 2000, 3000, 4000])
  })

  test("handles an empty chunk list", () => {
    expect(advanceAudioChunkCursor([], 0, Number.POSITIVE_INFINITY)).toBe(0)
  })
})
