"use client"

import { create } from "zustand"
import { analyzeAudioSource } from "@/lib/editor/audio/analyze-client"
import {
  clampBandConfig,
  createDefaultAudioBands,
} from "@/lib/editor/audio/bands"
import {
  type AudioEnvelopeSet,
  computeEnvelopeSet,
} from "@/lib/editor/audio/envelope"
import {
  type AudioLinkPatch,
  type AudioModulationInput,
  createAudioLink,
  type CreateAudioLinkInput,
  getAudioLinkKey,
  patchAudioLink,
} from "@/lib/editor/audio/links"
import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"
import {
  AUDIO_BAND_IDS,
  type AudioBandConfig,
  type AudioBandId,
  type AudioLink,
  type AudioSourceRef,
  type EditorAudioSnapshot,
} from "@/types/editor"

export type AudioAnalysisStatus =
  | "analyzing"
  | "error"
  /** A source is referenced but its asset is not present (e.g. after import). */
  | "missing-source"
  | "idle"
  | "ready"

export interface AudioStoreState {
  analysisProgress: number
  bands: Record<AudioBandId, AudioBandConfig>
  /** Derived from the spectrogram; never persisted. */
  envelopes: AudioEnvelopeSet | null
  error: string | null
  links: AudioLink[]
  offsetSeconds: number
  source: AudioSourceRef | null
  /**
   * Retained so band edits re-run only the cheap normalization pass instead of
   * re-decoding. Never persisted and never put in a history snapshot.
   */
  spectrogram: AudioSpectrogram | null
  status: AudioAnalysisStatus
}

export interface AudioStoreActions {
  addLink: (input: CreateAudioLinkInput) => AudioLink
  analyze: (url: string) => Promise<void>
  cancelAnalysis: () => void
  clearSource: () => void
  getSnapshot: () => EditorAudioSnapshot
  removeLink: (id: string) => void
  removeLinksForLayer: (layerId: string) => void
  /** Load a project: discards analysis, since blob URLs do not persist. */
  replaceState: (snapshot: EditorAudioSnapshot) => void
  /** Undo/redo: restores config while keeping the decoded audio intact. */
  restoreSnapshot: (snapshot: EditorAudioSnapshot) => void
  resetBands: () => void
  setLinkEnabled: (id: string, enabled: boolean) => void
  setOffsetSeconds: (offsetSeconds: number) => void
  setSource: (source: AudioSourceRef | null) => void
  setStatus: (status: AudioAnalysisStatus, error?: string | null) => void
  updateBand: (bandId: AudioBandId, patch: Partial<AudioBandConfig>) => void
  updateLink: (id: string, patch: AudioLinkPatch) => void
}

export type AudioStore = AudioStoreState & AudioStoreActions

function areBandsEqual(
  left: Record<AudioBandId, AudioBandConfig>,
  right: Record<AudioBandId, AudioBandConfig>
): boolean {
  return AUDIO_BAND_IDS.every((bandId) => {
    const a = left[bandId]
    const b = right[bandId]

    return (
      a.attackMs === b.attackMs &&
      a.gainDb === b.gainDb &&
      a.highHz === b.highHz &&
      a.lowHz === b.lowHz &&
      a.releaseMs === b.releaseMs
    )
  })
}

/** Not in state: an in-flight analysis must not trigger re-renders. */
let activeAnalysis: AbortController | null = null

/**
 * Build the modulation input for `buildRendererFrame`, or `null` when audio
 * cannot contribute anything.
 *
 * Shared by every consumer — the live render loop, the offline exporter and the
 * agent screenshot path — so they cannot disagree about what a frame looks like.
 * Returns a small object by reference; the envelopes themselves are never
 * copied, which matters because the exporter `structuredClone`s its timeline
 * several times per frame.
 */
export function selectAudioModulationInput(
  state: Pick<AudioStoreState, "envelopes" | "links" | "offsetSeconds">
): AudioModulationInput | null {
  if (!state.envelopes) {
    return null
  }

  if (state.links.length === 0) {
    return null
  }

  return {
    envelopes: state.envelopes,
    links: state.links,
    offsetSeconds: state.offsetSeconds,
  }
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  analysisProgress: 0,
  bands: createDefaultAudioBands(),
  envelopes: null,
  error: null,
  links: [],
  offsetSeconds: 0,
  source: null,
  spectrogram: null,
  status: "idle",

  addLink: (input) => {
    const link = createAudioLink(input)
    const key = getAudioLinkKey(link)

    set((state) => ({
      // One link per layer+binding: adding to an already-linked parameter
      // replaces rather than stacking.
      links: [
        ...state.links.filter((entry) => getAudioLinkKey(entry) !== key),
        link,
      ],
    }))

    return link
  },

  analyze: async (url) => {
    activeAnalysis?.abort()
    const controller = new AbortController()
    activeAnalysis = controller

    set({ analysisProgress: 0, error: null, status: "analyzing" })

    try {
      const spectrogram = await analyzeAudioSource(url, {
        onProgress: (progress) => {
          // Ignore progress from a superseded run.
          if (activeAnalysis === controller) {
            set({ analysisProgress: progress })
          }
        },
        signal: controller.signal,
      })

      if (activeAnalysis !== controller) {
        return
      }

      set({
        analysisProgress: 1,
        envelopes: computeEnvelopeSet(spectrogram, get().bands),
        error: null,
        spectrogram,
        status: "ready",
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }

      if (activeAnalysis !== controller) {
        return
      }

      set({
        analysisProgress: 0,
        envelopes: null,
        error: error instanceof Error ? error.message : "Audio analysis failed",
        spectrogram: null,
        status: "error",
      })
    } finally {
      if (activeAnalysis === controller) {
        activeAnalysis = null
      }
    }
  },

  cancelAnalysis: () => {
    activeAnalysis?.abort()
    activeAnalysis = null

    if (get().status === "analyzing") {
      set({ analysisProgress: 0, status: get().spectrogram ? "ready" : "idle" })
    }
  },

  clearSource: () => {
    activeAnalysis?.abort()
    activeAnalysis = null

    set({
      analysisProgress: 0,
      envelopes: null,
      error: null,
      source: null,
      spectrogram: null,
      status: "idle",
    })
  },

  getSnapshot: () => {
    const { bands, links, offsetSeconds, source } = get()

    return { bands, links, offsetSeconds, source }
  },

  removeLink: (id) => {
    set((state) => ({
      links: state.links.filter((link) => link.id !== id),
    }))
  },

  removeLinksForLayer: (layerId) => {
    set((state) => ({
      links: state.links.filter((link) => link.layerId !== layerId),
    }))
  },

  replaceState: (snapshot) => {
    activeAnalysis?.abort()
    activeAnalysis = null

    set({
      analysisProgress: 0,
      bands: { ...snapshot.bands },
      envelopes: null,
      error: null,
      links: [...snapshot.links],
      offsetSeconds: snapshot.offsetSeconds,
      source: snapshot.source,
      spectrogram: null,
      // Blob URLs are not persisted, so an imported source must be re-linked
      // and re-analysed before it can drive anything.
      status: snapshot.source ? "missing-source" : "idle",
    })
  },

  restoreSnapshot: (snapshot) => {
    const state = get()
    const bandsChanged = !areBandsEqual(state.bands, snapshot.bands)

    set({
      bands: bandsChanged ? { ...snapshot.bands } : state.bands,
      // Keep the cached spectrogram and status: undoing a link edit must not
      // throw away multi-second analysis work. Only recompute envelopes when the
      // band configs actually changed.
      envelopes:
        bandsChanged && state.spectrogram
          ? computeEnvelopeSet(state.spectrogram, snapshot.bands)
          : state.envelopes,
      links: [...snapshot.links],
      offsetSeconds: snapshot.offsetSeconds,
      source: snapshot.source,
    })
  },

  resetBands: () => {
    const bands = createDefaultAudioBands()
    const spectrogram = get().spectrogram

    set({
      bands,
      envelopes: spectrogram ? computeEnvelopeSet(spectrogram, bands) : null,
    })
  },

  setLinkEnabled: (id, enabled) => {
    set((state) => ({
      links: state.links.map((link) =>
        link.id === id ? { ...link, enabled } : link
      ),
    }))
  },

  setOffsetSeconds: (offsetSeconds) => {
    set({
      offsetSeconds: Number.isFinite(offsetSeconds) ? offsetSeconds : 0,
    })
  },

  setSource: (source) => {
    set({ error: null, source })
  },

  setStatus: (status, error) => {
    set({ error: error ?? null, status })
  },

  updateBand: (bandId, patch) => {
    const state = get()
    const bands = {
      ...state.bands,
      [bandId]: clampBandConfig(
        { ...state.bands[bandId], ...patch },
        state.spectrogram?.sampleRate ?? 48000
      ),
    }

    // Stage B only — a band edit must never re-decode or re-run the FFT. This is
    // what makes dragging a frequency boundary feel instant.
    set({
      bands,
      envelopes: state.spectrogram
        ? computeEnvelopeSet(state.spectrogram, bands)
        : null,
    })
  },

  updateLink: (id, patch) => {
    set((state) => ({
      links: state.links.map((link) =>
        link.id === id ? patchAudioLink(link, patch) : link
      ),
    }))
  },
}))

/**
 * Debug hook for the Playwright UI harness in `.context/ui-debug.ts`, which
 * needs ground truth about link state that the DOM alone cannot provide.
 * Development only — never exposed in a production bundle.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  ;(
    window as unknown as { __SHADER_LAB_AUDIO_DEBUG__: () => unknown }
  ).__SHADER_LAB_AUDIO_DEBUG__ = () => {
    const state = useAudioStore.getState()

    return {
      links: state.links.map((link) => ({
        band: link.band,
        enabled: link.enabled,
        key: link.binding.kind === "param" ? link.binding.key : link.binding.property,
        outMax: link.outMax,
        outMin: link.outMin,
      })),
      silentBands: state.envelopes?.silentBands ?? null,
      status: state.status,
    }
  }
}
