"use client"

import {
  definePatch,
  defineSound,
  ensureReady,
  type Layer,
  type MultiLayerSound,
  type SoundDefinition,
} from "@web-kits/audio"
import { useSoundStore } from "@/store/sound-store"
import { _patch as minimalPatchData } from "./patches/minimal"

export type UISoundId =
  | "generic.press"
  | "generic.toggleOn"
  | "generic.toggleOff"
  | "generic.selectCommit"
  | "generic.numberCommit"
  | "generic.dragStart"
  | "generic.dragEnd"
  | "generic.dragStepUp"
  | "generic.dragStepDown"
  | "action.randomize"
  | "action.play"
  | "action.pause"
  | "action.stop"
  | "action.loopOn"
  | "action.loopOff"
  | "action.autoKeyOn"
  | "action.autoKeyOff"
  | "action.addLayer"
  | "action.deleteLayer"
  | "action.undo"
  | "action.redo"
  | "action.zoomIn"
  | "action.zoomOut"
  | "action.hideUI"
  | "action.qualityDraft"
  | "action.qualityStandard"
  | "action.qualityHigh"
  | "action.qualityUltra"
  | "action.reset"
  | "action.panelSwitch"
  | "action.visibilityOn"
  | "action.visibilityOff"
  | "action.relinkAsset"
  | "action.export"

type OptionalUISoundId = UISoundId | "none" | undefined
type GenericUISoundId = Extract<UISoundId, `generic.${string}`>
type LocalGenericUISoundId = "generic.dragStepUp" | "generic.dragStepDown"
type PatchGenericUISoundId = Exclude<GenericUISoundId, LocalGenericUISoundId>
type ActionUISoundId = Extract<UISoundId, `action.${string}`>
type LocalUISoundId = ActionUISoundId | LocalGenericUISoundId
type GMajorPitchClass = "G" | "A" | "B" | "C" | "D" | "E" | "F#"
type GMajorOctave = 2 | 3 | 4 | 5 | 6
export type GMajorNote = `${GMajorPitchClass}${GMajorOctave}`
type SliderStepDirection = "up" | "down"

const NOTE_OFFSETS = {
  C: -9,
  "C#": -8,
  D: -7,
  "D#": -6,
  E: -5,
  F: -4,
  "F#": -3,
  G: -2,
  "G#": -1,
  A: 0,
  "A#": 1,
  B: 2,
} as const

const SLIDER_STEP_NOTES: readonly GMajorNote[] = [
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "F#5",
  "G5",
  "A5",
  "B5",
  "C6",
  "D6",
]

export const GENERIC_UI_SOUND_MAP = {
  "generic.press": "click",
  "generic.toggleOn": "toggle-on",
  "generic.toggleOff": "toggle-off",
  "generic.selectCommit": "select",
  "generic.numberCommit": "key-press",
  "generic.dragStart": "slide",
  "generic.dragEnd": "pop",
} as const satisfies Record<PatchGenericUISoundId, string>

function tone(
  type: "sine" | "triangle" | "square" | "sawtooth",
  frequency: number | { end: number; start: number },
  gain: number,
  decay: number,
  extra?: Partial<Layer>
): Layer {
  return {
    envelope: { attack: 0.002, decay, release: 0.03, sustain: 0 },
    gain,
    source: { type, frequency },
    ...extra,
  }
}

export function gMajor(note: GMajorNote): number {
  const match = note.match(/^([A-G]#?)(\d)$/)

  if (!match) {
    throw new Error(`Invalid note: ${note}`)
  }

  const [, pitchClass, octaveValue] = match
  const octave = Number(octaveValue)
  const semitoneOffset = NOTE_OFFSETS[pitchClass as keyof typeof NOTE_OFFSETS]
  const semitonesFromA4 = semitoneOffset + (octave - 4) * 12

  return 440 * 2 ** (semitonesFromA4 / 12)
}

export function gMajorGlide(start: GMajorNote, end: GMajorNote) {
  return {
    end: gMajor(end),
    start: gMajor(start),
  }
}

function pair(
  first: GMajorNote,
  second: GMajorNote,
  gain: number,
  decay: number,
  extra?: Partial<MultiLayerSound>
): MultiLayerSound {
  return {
    effects: [{ mix: 0.08, preDelay: 0.004, type: "reverb" }],
    layers: [
      tone("sine", gMajor(first), gain, decay, {
        envelope: { attack: 0, decay, release: 0.01, sustain: 0 },
        pan: -0.03,
      }),
      tone("sine", gMajor(second), gain * 0.92, decay, {
        delay: 0.034,
        envelope: { attack: 0, decay, release: 0.01, sustain: 0 },
        pan: 0.03,
      }),
    ],
    ...extra,
  }
}

function ping(
  note: GMajorNote,
  gain = 0.08,
  decay = 0.02,
  extra?: Partial<Layer>
): Layer {
  return tone("sine", gMajor(note), gain, decay, {
    envelope: { attack: 0, decay, release: 0.006, sustain: 0 },
    ...extra,
  })
}

function clampNormalizedValue(value: number) {
  return Math.max(0, Math.min(1, value))
}

function getSliderStepNote(normalizedProgress: number) {
  const index = Math.round(
    clampNormalizedValue(normalizedProgress) * (SLIDER_STEP_NOTES.length - 1)
  )

  return SLIDER_STEP_NOTES[index] ?? "G4"
}

function glass(
  base: GMajorNote,
  peak: GMajorNote,
  gain: number,
  decay: number,
  extra?: Partial<MultiLayerSound>
): MultiLayerSound {
  return {
    effects: [{ mix: 0.1, preDelay: 0.006, type: "reverb" }],
    layers: [
      tone("sine", gMajorGlide(peak, base), gain, decay, {
        envelope: { attack: 0, decay, release: 0.012, sustain: 0 },
      }),
      tone(
        "sine",
        {
          end: gMajor(base) * 2,
          start: gMajor(peak) * 2,
        },
        gain * 0.32,
        decay + 0.01,
        {
          delay: 0.018,
          envelope: {
            attack: 0,
            decay: decay + 0.01,
            release: 0.01,
            sustain: 0,
          },
          pan: -0.04,
        }
      ),
    ],
    ...extra,
  }
}

export const UI_SOUND_DEFINITIONS = {
  "generic.dragStepUp": ping("D5", 0.03, 0.012),
  "generic.dragStepDown": ping("B4", 0.03, 0.012),
  "action.randomize": {
    effects: [{ depth: 0.0022, mix: 0.18, rate: 1.8, type: "chorus" }],
    layers: [
      tone("sine", gMajorGlide("G4", "G5"), 0.11, 0.075, {
        envelope: { attack: 0, decay: 0.075, release: 0.012, sustain: 0 },
        pan: -0.08,
      }),
      tone("sine", gMajorGlide("A5", "B5"), 0.09, 0.07, {
        delay: 0.032,
        envelope: { attack: 0, decay: 0.07, release: 0.012, sustain: 0 },
        pan: 0.02,
      }),
      tone("sine", gMajorGlide("C6", "D6"), 0.08, 0.082, {
        delay: 0.064,
        envelope: { attack: 0, decay: 0.082, release: 0.014, sustain: 0 },
        pan: 0.08,
      }),
    ],
  },
  "action.play": ping("G5", 0.086, 0.02),
  "action.pause": ping("E5", 0.078, 0.02),
  "action.stop": ping("C5", 0.084, 0.022),
  "action.loopOn": ping("D5", 0.08, 0.021),
  "action.loopOff": ping("B4", 0.074, 0.019),
  "action.autoKeyOn": {
    effects: [{ type: "chorus", rate: 1.2, depth: 0.0018, mix: 0.12 }],
    layers: [
      ping("A5", 0.074, 0.022),
      tone("sine", gMajorGlide("G5", "A6"), 0.026, 0.028, {
        delay: 0.012,
        envelope: { attack: 0, decay: 0.028, release: 0.008, sustain: 0 },
        pan: 0.03,
      }),
    ],
  },
  "action.autoKeyOff": {
    layers: [
      ping("F#5", 0.068, 0.02),
      tone("sine", gMajorGlide("A5", "F#5"), 0.018, 0.024, {
        delay: 0.006,
        envelope: { attack: 0, decay: 0.024, release: 0.008, sustain: 0 },
      }),
    ],
  },
  "action.addLayer": {
    effects: [{ mix: 0.12, preDelay: 0.006, type: "reverb" }],
    layers: [
      tone("sine", gMajor("G4"), 0.086, 0.07, {
        envelope: { attack: 0, decay: 0.17, release: 0.012, sustain: 0 },
        pan: -0.06,
      }),
      tone("sine", gMajor("A4"), 0.07, 0.066, {
        delay: 0.016,
        envelope: { attack: 0, decay: 0.16, release: 0.012, sustain: 0 },
        pan: -0.02,
      }),
      tone("sine", gMajor("D5"), 0.082, 0.178, {
        delay: 0.048,
        envelope: { attack: 0, decay: 0.178, release: 0.014, sustain: 0 },
        pan: 0.08,
      }),
    ],
  },
  "action.deleteLayer": {
    layers: [
      tone("sine", { end: 120, start: 520 }, 0.12, 0.09),
      {
        envelope: { attack: 0.001, decay: 0.045, release: 0.02, sustain: 0 },
        gain: 0.024,
        source: { color: "pink", type: "noise" },
      },
    ],
    effects: [
      { type: "bitcrusher", sampleRateReduction: 100, bits: 6, mix: 0.2 },
      {
        type: "delay",
        mix: 1,
        feedbackFilter: { type: "lowpass", frequency: 1000 },
        feedback: 0.08,
        time: 0.1,
      },
    ],
  },
  "action.undo": pair("C5", "G4", 0.092, 0.055),
  "action.redo": pair("G4", "C5", 0.092, 0.055),
  "action.zoomIn": pair("D5", "G5", 0.086, 0.05),
  "action.zoomOut": pair("G5", "D5", 0.086, 0.05),
  "action.hideUI": {
    effects: [
      { type: "chorus", rate: 0.68, depth: 0.0038, mix: 0.3 },
      {
        type: "reverb",
        decay: 1.45,
        damping: 0.5,
        roomSize: 1.25,
        preDelay: 0.018,
        mix: 0.32,
      },
    ],
    layers: [
      tone("sine", gMajor("G3"), 0.024, 0.72, {
        envelope: { attack: 0.05, decay: 0.72, sustain: 0.16, release: 0.34 },
        pan: -0.18,
      }),
      tone("sine", gMajor("D4"), 0.02, 0.68, {
        delay: 0.018,
        envelope: { attack: 0.045, decay: 0.68, sustain: 0.15, release: 0.32 },
        pan: -0.05,
      }),
      tone("sine", gMajor("A4"), 0.021, 0.78, {
        delay: 0.034,
        envelope: { attack: 0.055, decay: 0.78, sustain: 0.14, release: 0.36 },
        pan: 0.08,
      }),
      tone("sine", gMajor("E5"), 0.03, 0.7, {
        delay: 0.055,
        envelope: { attack: 0.06, decay: 0.7, sustain: 0.12, release: 0.3 },
        pan: 0.18,
      }),
    ],
  },
  "action.qualityDraft": ping("G4", 0.072, 0.018),
  "action.qualityStandard": ping("B4", 0.076, 0.019),
  "action.qualityHigh": ping("D5", 0.08, 0.02),
  "action.qualityUltra": ping("G5", 0.084, 0.021),
  "action.reset": {
    effects: [{ mix: 0.06, preDelay: 0.003, type: "reverb" }],
    layers: [
      tone("sine", gMajor("D5"), 0.068, 0.026, {
        envelope: { attack: 0, decay: 0.026, release: 0.008, sustain: 0 },
        pan: -0.02,
      }),
      tone("sine", gMajor("G4"), 0.082, 0.03, {
        delay: 0.03,
        envelope: { attack: 0, decay: 0.03, release: 0.01, sustain: 0 },
        pan: 0.02,
      }),
    ],
  },
  "action.panelSwitch": glass("E5", "D6", 0.1, 0.07),
  "action.visibilityOn": pair("B4", "D5", 0.084, 0.048),
  "action.visibilityOff": pair("D5", "B4", 0.084, 0.048),
  "action.relinkAsset": {
    effects: [{ mix: 0.18, preDelay: 0.008, type: "reverb" }],
    layers: [
      tone("triangle", { end: 560, start: 1080 }, 0.09, 0.07),
      tone("sine", { end: 920, start: 1400 }, 0.05, 0.08),
    ],
  },
  "action.export": {
    effects: [{ mix: 0.12, preDelay: 0.006, type: "reverb" }],
    layers: [
      tone("sine", gMajorGlide("F#6", "B6"), 0.062, 0.054, {
        delay: 0.038,
        envelope: { attack: 0, decay: 0.054, release: 0.016, sustain: 0 },
        pan: 0.05,
      }),
    ],
  },
} satisfies Record<LocalUISoundId, SoundDefinition>

const UI_SOUND_PLAYERS = Object.fromEntries(
  Object.entries(UI_SOUND_DEFINITIONS).map(([soundId, definition]) => [
    soundId,
    defineSound(definition),
  ])
) as Record<LocalUISoundId, ReturnType<typeof defineSound>>

let readyPromise: Promise<void> | null = null
let genericPatch: ReturnType<typeof definePatch> | null = null
const sliderStepPlayerCache = new Map<string, ReturnType<typeof defineSound>>()

function ensureAudioReady() {
  if (typeof window === "undefined") {
    return null
  }

  if (!readyPromise) {
    readyPromise = ensureReady()
      .then(() => undefined)
      .catch(() => {
        readyPromise = null
      })
  }

  return readyPromise
}

function getGenericPatch() {
  if (!genericPatch) {
    genericPatch = definePatch(minimalPatchData)
  }

  return genericPatch
}

function getSliderStepPlayer(
  direction: SliderStepDirection,
  normalizedProgress: number
) {
  const note = getSliderStepNote(normalizedProgress)
  const cacheKey = `${direction}:${note}`
  const existingPlayer = sliderStepPlayerCache.get(cacheKey)

  if (existingPlayer) {
    return existingPlayer
  }

  const targetFrequency = gMajor(note)
  const startFrequency =
    direction === "up" ? targetFrequency * 0.985 : targetFrequency * 1.015

  const player = defineSound({
    envelope: { attack: 0, decay: 0.012, release: 0.004, sustain: 0 },
    gain: 0.026,
    source: {
      frequency: {
        end: targetFrequency,
        start: startFrequency,
      },
      type: "sine",
    },
  })

  sliderStepPlayerCache.set(cacheKey, player)

  return player
}

export function playUISound(soundId: UISoundId) {
  if (typeof window === "undefined") {
    return
  }

  if (!useSoundStore.getState().enabled) {
    return
  }

  if (soundId.startsWith("generic.")) {
    const localPlayer = UI_SOUND_PLAYERS[soundId as LocalGenericUISoundId]
    const maybeReady = ensureAudioReady()

    if (!maybeReady) {
      return
    }

    if (localPlayer) {
      void maybeReady.then(() => {
        if (!useSoundStore.getState().enabled) {
          return
        }

        localPlayer()
      })

      return
    }

    const patchSound = GENERIC_UI_SOUND_MAP[soundId as PatchGenericUISoundId]
    const patch = getGenericPatch()

    void maybeReady.then(() => {
      if (!useSoundStore.getState().enabled) {
        return
      }

      patch.play(patchSound)
    })

    return
  }

  const player = UI_SOUND_PLAYERS[soundId as ActionUISoundId]
  const maybeReady = ensureAudioReady()

  if (!maybeReady) {
    return
  }

  void maybeReady.then(() => {
    if (!useSoundStore.getState().enabled) {
      return
    }

    player?.()
  })
}

export function playSliderStepSound(
  direction: SliderStepDirection,
  normalizedProgress: number
) {
  if (typeof window === "undefined") {
    return
  }

  if (!useSoundStore.getState().enabled) {
    return
  }

  const player = getSliderStepPlayer(direction, normalizedProgress)
  const maybeReady = ensureAudioReady()

  if (!maybeReady) {
    return
  }

  void maybeReady.then(() => {
    if (!useSoundStore.getState().enabled) {
      return
    }

    player()
  })
}

export function playOptionalUISound(soundId: OptionalUISoundId) {
  if (!soundId || soundId === "none") {
    return
  }

  playUISound(soundId)
}
