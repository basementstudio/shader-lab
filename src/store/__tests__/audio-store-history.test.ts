import { beforeEach, describe, expect, test } from "bun:test"
import { createDefaultAudioBands } from "@/lib/editor/audio/bands"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"
import { useAudioStore } from "@/store/audio-store"
import type { EditorAudioSnapshot } from "@/types/editor"

const spectrogram = {
  centerHz: new Float32Array([100]),
  durationSeconds: 1,
  envelopeRate: 60,
  frameCount: 1,
  frames: new Float32Array([1]),
  sampleRate: 48_000,
} as unknown as AudioSpectrogram

const envelopes = {
  bands: {
    bass: new Float32Array([1]),
    high: new Float32Array([1]),
    level: new Float32Array([1]),
    mid: new Float32Array([1]),
  },
  durationSeconds: 1,
  envelopeRate: 60,
  sampleCount: 1,
  silentBands: [],
} as AudioEnvelopeSet

function snapshotWith(
  source: EditorAudioSnapshot["source"]
): EditorAudioSnapshot {
  return {
    bands: createDefaultAudioBands(),
    links: [],
    offsetSeconds: 0,
    source,
  }
}

function seedReadyStore(assetId: string) {
  useAudioStore.setState({
    analysisProgress: 1,
    bands: createDefaultAudioBands(),
    envelopes,
    error: null,
    links: [],
    offsetSeconds: 0,
    source: { assetId, kind: "asset" },
    spectrogram,
    status: "ready",
  })
}

describe("audio store restoreSnapshot", () => {
  beforeEach(() => {
    seedReadyStore("asset-a")
  })

  test("undoing a cleared source queues a re-analysis instead of wedging", () => {
    useAudioStore.getState().clearSource()
    expect(useAudioStore.getState().status).toBe("idle")

    useAudioStore
      .getState()
      .restoreSnapshot(snapshotWith({ assetId: "asset-a", kind: "asset" }))

    const state = useAudioStore.getState()
    expect(state.source).toEqual({ assetId: "asset-a", kind: "asset" })
    expect(state.status).toBe("missing-source")
    expect(state.spectrogram).toBeNull()
    expect(state.envelopes).toBeNull()
  })

  test("restoring a different source drops the stale analysis", () => {
    useAudioStore
      .getState()
      .restoreSnapshot(snapshotWith({ assetId: "asset-b", kind: "asset" }))

    const state = useAudioStore.getState()
    expect(state.source).toEqual({ assetId: "asset-b", kind: "asset" })
    expect(state.status).toBe("missing-source")
    expect(state.spectrogram).toBeNull()
  })

  test("restoring to no source lands on idle", () => {
    useAudioStore.getState().restoreSnapshot(snapshotWith(null))

    const state = useAudioStore.getState()
    expect(state.source).toBeNull()
    expect(state.status).toBe("idle")
    expect(state.envelopes).toBeNull()
  })

  test("an unchanged source keeps the existing analysis", () => {
    useAudioStore
      .getState()
      .restoreSnapshot(snapshotWith({ assetId: "asset-a", kind: "asset" }))

    const state = useAudioStore.getState()
    expect(state.status).toBe("ready")
    expect(state.spectrogram).toBe(spectrogram)
    expect(state.envelopes).toBe(envelopes)
  })
})
