import { getLayerBindingKey } from "@/lib/editor/binding-key"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { resolveAudioLinkValue } from "@/lib/editor/audio/modulate"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import { sampleAllBandsInto } from "@/lib/editor/audio/envelope-lookup"
import {
  getParameterDefinition,
  isParameterAudioModulatable,
} from "@/lib/editor/parameter-schema"
import type { EvaluatedLayerState } from "@/lib/editor/timeline/evaluate"
import type {
  AnimatedPropertyBinding,
  AudioBandId,
  AudioLink,
  AudioLinkComponent,
  EditorLayer,
  ParameterDefinition,
  ParameterValue,
  TimelineTrack,
} from "@/types/editor"

export type AudioModulationInput = {
  envelopes: AudioEnvelopeSet
  links: AudioLink[]
  offsetSeconds: number
}

export type CreateAudioLinkInput = {
  band: AudioBandId
  binding: AnimatedPropertyBinding
  component?: AudioLinkComponent
  enabled?: boolean
  id: string
  layerId: string
  outMax: number
  outMin: number
  quantize?: boolean
  threshold?: number
}

export function createAudioLink(input: CreateAudioLinkInput): AudioLink {
  const link: AudioLink = {
    band: input.band,
    binding: input.binding,
    enabled: input.enabled ?? true,
    id: input.id,
    layerId: input.layerId,
    outMax: input.outMax,
    outMin: input.outMin,
  }

  return {
    ...link,
    ...(input.component === undefined ? {} : { component: input.component }),
    ...(input.quantize === undefined ? {} : { quantize: input.quantize }),
    ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
  }
}

export type AudioLinkPatch = Partial<Omit<AudioLink, "binding" | "id" | "layerId">>

export function patchAudioLink(link: AudioLink, patch: AudioLinkPatch): AudioLink {
  const next: AudioLink = { ...link }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof AudioLink]
      continue
    }

    Object.assign(next, { [key]: value })
  }

  return next
}

export function getAudioLinkKey(link: AudioLink): string {
  return getLayerBindingKey(link.layerId, link.binding)
}

export function findAudioLink(
  links: AudioLink[],
  layerId: string,
  binding: AnimatedPropertyBinding
): AudioLink | null {
  const key = getLayerBindingKey(layerId, binding)

  return links.find((link) => getAudioLinkKey(link) === key) ?? null
}

export function hasAudioLink(
  links: AudioLink[],
  layerId: string,
  binding: AnimatedPropertyBinding
): boolean {
  return findAudioLink(links, layerId, binding) !== null
}

export type AudioLinkConflict = {
  link: AudioLink
  track: TimelineTrack
}

export function findConflictingAudioLinks(
  links: AudioLink[],
  tracks: TimelineTrack[]
): AudioLinkConflict[] {
  if (links.length === 0 || tracks.length === 0) {
    return []
  }

  const trackByKey = new Map<string, TimelineTrack>()
  for (const track of tracks) {
    trackByKey.set(getLayerBindingKey(track.layerId, track.binding), track)
  }

  const conflicts: AudioLinkConflict[] = []
  for (const link of links) {
    const track = trackByKey.get(getAudioLinkKey(link))
    if (track) {
      conflicts.push({ link, track })
    }
  }

  return conflicts
}

const definitionCache = new Map<string, ParameterDefinition | null>()

function resolveDefinition(
  layer: EditorLayer,
  binding: AnimatedPropertyBinding
): ParameterDefinition | null {
  if (binding.kind === "layer") {
    return null
  }

  const cacheKey = `${layer.type}:${binding.key}`
  const cached = definitionCache.get(cacheKey)

  if (cached !== undefined) {
    return cached
  }

  const definition = getParameterDefinition(
    getLayerDefinition(layer.type).params,
    binding.key
  )

  definitionCache.set(cacheKey, definition)
  return definition
}

function findLayer(layers: EditorLayer[], layerId: string): EditorLayer | null {
  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer
    }
  }

  return null
}

const bandValueScratch = {} as Record<AudioBandId, number>

export function applyAudioModulation(
  layers: EditorLayer[],
  keyframeStates: EvaluatedLayerState[],
  audio: AudioModulationInput,
  time: number
): EvaluatedLayerState[] {
  let hasEnabledLink = false

  for (const link of audio.links) {
    if (link.enabled) {
      hasEnabledLink = true
      break
    }
  }

  if (!hasEnabledLink) {
    return keyframeStates
  }

  const bandValues = sampleAllBandsInto(
    audio.envelopes,
    audio.offsetSeconds,
    time,
    bandValueScratch
  )

  let output: EvaluatedLayerState[] | null = null

  for (const link of audio.links) {
    if (!link.enabled) {
      continue
    }

    const layer = findLayer(layers, link.layerId)

    if (!layer) {
      continue
    }

    const definition = resolveDefinition(layer, link.binding)

    if (link.binding.kind === "param") {
      if (definition === null) {
        continue
      }

      if (!isParameterAudioModulatable(definition)) {
        continue
      }
    }

    if (!output) {
      output = keyframeStates.slice()
    }

    let index = -1

    for (let cursor = 0; cursor < output.length; cursor += 1) {
      if (output[cursor]?.layerId === link.layerId) {
        index = cursor
        break
      }
    }

    let state: EvaluatedLayerState

    if (index === -1) {
      state = { layerId: link.layerId, params: {}, properties: {} }
      output.push(state)
    } else {
      const existing = output[index] as EvaluatedLayerState

      if (existing === keyframeStates[index]) {
        state = {
          layerId: existing.layerId,
          params: { ...existing.params },
          properties: { ...existing.properties },
        }
        output[index] = state
      } else {
        state = existing
      }
    }

    const base: ParameterValue | undefined =
      link.binding.kind === "param"
        ? (state.params[link.binding.key] ?? layer.params[link.binding.key])
        : undefined

    const value = resolveAudioLinkValue(
      link,
      definition,
      base,
      bandValues[link.band]
    )

    if (value === null) {
      continue
    }

    if (link.binding.kind === "param") {
      state.params[link.binding.key] = value
      continue
    }

    if (link.binding.property === "visible") {
      if (typeof value === "boolean") {
        state.properties.visible = value
      }
      continue
    }

    if (typeof value === "number") {
      state.properties[link.binding.property] = value
    }
  }

  return output ?? keyframeStates
}
