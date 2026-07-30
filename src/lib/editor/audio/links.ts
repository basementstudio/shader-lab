import { getLayerBindingKey } from "@/lib/editor/binding-key"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { resolveAudioLinkValue } from "@/lib/editor/audio/modulate"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import { sampleAllBands } from "@/lib/editor/audio/envelope-lookup"
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

/**
 * Only constructor for {@link AudioLink}.
 *
 * `exactOptionalPropertyTypes` makes `{ component: undefined }` a type error and
 * a latent `.lab` round-trip hazard, so the optional fields are *omitted* rather
 * than set to undefined. Building these literals inline invites that bug.
 */
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

/** Apply a patch while preserving the omit-not-undefined invariant. */
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

/**
 * Links that target the same layer+binding as an existing keyframe track.
 *
 * Audio takes precedence in the engine, so a conflict is never an error — but
 * the user should be told their keyframes are being overridden, and offered
 * either removal or a bake-to-keyframes conversion.
 */
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

function resolveDefinition(
  layer: EditorLayer,
  binding: AnimatedPropertyBinding
): ParameterDefinition | null {
  if (binding.kind === "layer") {
    return null
  }

  return getParameterDefinition(getLayerDefinition(layer.type).params, binding.key)
}

/**
 * Layer audio-driven values on top of the keyframe evaluation result.
 *
 * Runs *after* `evaluateTimelineForLayers` and receives its output, so audio
 * wins on conflict and so a per-component vec link merges into a keyframed
 * value rather than discarding it.
 *
 * Returns a fresh array of fresh states — never aliases anything from
 * `layers`, which is what keeps `renderer/contracts.ts`'s `paramsCloneCache`
 * safe.
 */
export function applyAudioModulation(
  layers: EditorLayer[],
  keyframeStates: EvaluatedLayerState[],
  audio: AudioModulationInput,
  time: number
): EvaluatedLayerState[] {
  const activeLinks = audio.links.filter((link) => link.enabled)

  if (activeLinks.length === 0) {
    return keyframeStates
  }

  const layerById = new Map(layers.map((layer) => [layer.id, layer]))

  // Copy the incoming states so callers keep their originals intact.
  const stateByLayerId = new Map<string, EvaluatedLayerState>()
  for (const state of keyframeStates) {
    stateByLayerId.set(state.layerId, {
      layerId: state.layerId,
      params: { ...state.params },
      properties: { ...state.properties },
    })
  }

  const bandValues = sampleAllBands(audio.envelopes, audio.offsetSeconds, time)

  for (const link of activeLinks) {
    const layer = layerById.get(link.layerId)

    // Links pointing at deleted layers are inert, matching how
    // `evaluateTimelineForLayers` filters orphaned tracks rather than pruning.
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

    let state = stateByLayerId.get(link.layerId)
    if (!state) {
      state = { layerId: link.layerId, params: {}, properties: {} }
      stateByLayerId.set(link.layerId, state)
    }

    // Base is what this parameter would otherwise be this frame: the keyframe
    // result if one exists, else the stored value. Only vec merges use it.
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

  return [...stateByLayerId.values()]
}
