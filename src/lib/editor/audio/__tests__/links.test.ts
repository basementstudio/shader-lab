import { describe, expect, test } from "bun:test"
import type { AudioEnvelopeSet } from "@/lib/editor/audio/envelope"
import {
  applyAudioModulation,
  createAudioLink,
  findAudioLink,
  findConflictingAudioLinks,
  hasAudioLink,
  patchAudioLink,
} from "@/lib/editor/audio/links"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { createLayer } from "@/lib/editor/layers"
import type { EvaluatedLayerState } from "@/lib/editor/timeline/evaluate"
import { LINEAR_EASING } from "@/lib/easing-curve"
import { AUDIO_BAND_IDS, type AudioBandId } from "@/types/editor"
import type {
  AnimatedPropertyBinding,
  EditorLayer,
  NumberParameterDefinition,
  TimelineTrack,
  Vec2ParameterDefinition,
} from "@/types/editor"

const gradientParams = getLayerDefinition("gradient").params

const numberParam = gradientParams.find(
  (definition): definition is NumberParameterDefinition =>
    definition.type === "number" &&
    definition.max !== undefined &&
    definition.min !== undefined
)
const vec2Param = gradientParams.find(
  (definition): definition is Vec2ParameterDefinition =>
    definition.type === "vec2"
)

if (numberParam === undefined) {
  throw new Error("gradient registry is missing a bounded number param")
}

if (vec2Param === undefined) {
  throw new Error("gradient registry is missing a vec2 param")
}

function paramBinding(key: string, label = key): AnimatedPropertyBinding {
  return { key, kind: "param", label, valueType: "number" }
}

function constantEnvelopes(value: number): AudioEnvelopeSet {
  const bands = {} as Record<AudioBandId, Float32Array>
  for (const bandId of AUDIO_BAND_IDS) {
    bands[bandId] = Float32Array.from([value, value])
  }

  return {
    bands,
    durationSeconds: 1,
    envelopeRate: 60,
    sampleCount: 2,
    silentBands: [],
  }
}

function makeLayer(): EditorLayer {
  return createLayer("gradient", 0)
}

describe("createAudioLink", () => {
  test("omits optional fields rather than setting them to undefined", () => {
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding("strength"),
      id: "l1",
      layerId: "layer-1",
      outMax: 1,
      outMin: 0,
    })

    expect("component" in link).toBe(false)
    expect("threshold" in link).toBe(false)
    expect("quantize" in link).toBe(false)
    expect(link.enabled).toBe(true)
  })

  test("keeps optional fields that were provided", () => {
    const link = createAudioLink({
      band: "mid",
      binding: paramBinding("strength"),
      component: "x",
      enabled: false,
      id: "l1",
      layerId: "layer-1",
      outMax: 1,
      outMin: 0,
      threshold: 0.8,
    })

    expect(link.component).toBe("x")
    expect(link.threshold).toBe(0.8)
    expect(link.enabled).toBe(false)
  })
})

describe("patchAudioLink", () => {
  const base = createAudioLink({
    band: "bass",
    binding: paramBinding("strength"),
    component: "x",
    id: "l1",
    layerId: "layer-1",
    outMax: 1,
    outMin: 0,
  })

  test("updates provided fields", () => {
    expect(patchAudioLink(base, { band: "high" }).band).toBe("high")
  })

  test("deletes a field set to undefined rather than storing undefined", () => {
    const patched = patchAudioLink(base, { component: undefined })

    expect("component" in patched).toBe(false)
  })

  test("does not mutate the original", () => {
    patchAudioLink(base, { band: "high" })

    expect(base.band).toBe("bass")
  })
})

describe("findAudioLink / hasAudioLink", () => {
  const link = createAudioLink({
    band: "bass",
    binding: paramBinding("strength"),
    id: "l1",
    layerId: "layer-1",
    outMax: 1,
    outMin: 0,
  })

  test("matches on layer and binding", () => {
    expect(findAudioLink([link], "layer-1", paramBinding("strength"))).toBe(link)
    expect(hasAudioLink([link], "layer-1", paramBinding("strength"))).toBe(true)
  })

  test("does not match another layer or another binding", () => {
    expect(hasAudioLink([link], "layer-2", paramBinding("strength"))).toBe(false)
    expect(hasAudioLink([link], "layer-1", paramBinding("other"))).toBe(false)
  })
})

describe("findConflictingAudioLinks", () => {
  const link = createAudioLink({
    band: "bass",
    binding: paramBinding("strength"),
    id: "l1",
    layerId: "layer-1",
    outMax: 1,
    outMin: 0,
  })

  function makeTrack(layerId: string, key: string): TimelineTrack {
    return {
      binding: paramBinding(key),
      enabled: true,
      id: `track-${key}`,
      keyframes: [{ easing: LINEAR_EASING, id: "k1", time: 0, value: 0 }],
      layerId,
    }
  }

  test("reports a link and track on the same layer and binding", () => {
    const conflicts = findConflictingAudioLinks(
      [link],
      [makeTrack("layer-1", "strength")]
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.link).toBe(link)
  })

  test("ignores tracks on other bindings or layers", () => {
    expect(
      findConflictingAudioLinks([link], [makeTrack("layer-1", "other")])
    ).toHaveLength(0)
    expect(
      findConflictingAudioLinks([link], [makeTrack("layer-2", "strength")])
    ).toHaveLength(0)
  })

  test("short-circuits on empty input", () => {
    expect(findConflictingAudioLinks([], [makeTrack("l", "k")])).toHaveLength(0)
    expect(findConflictingAudioLinks([link], [])).toHaveLength(0)
  })
})

describe("applyAudioModulation", () => {
  function apply(
    layers: EditorLayer[],
    links: ReturnType<typeof createAudioLink>[],
    keyframeStates: EvaluatedLayerState[] = [],
    bandValue = 1
  ): EvaluatedLayerState[] {
    return applyAudioModulation(
      layers,
      keyframeStates,
      {
        envelopes: constantEnvelopes(bandValue),
        links,
        offsetSeconds: 0,
      },
      0
    )
  }

  test("drives a bounded number parameter to its output maximum", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: numberParam.max ?? 1,
      outMin: numberParam.min ?? 0,
    })

    const states = apply([layer], [link], [], 1)

    expect(states[0]?.params[numberParam.key]).toBe(numberParam.max)
  })

  test("returns the keyframe states untouched when no links are active", () => {
    const layer = makeLayer()
    const keyframeStates: EvaluatedLayerState[] = [
      { layerId: layer.id, params: { a: 1 }, properties: {} },
    ]

    const disabled = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      enabled: false,
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    expect(apply([layer], [disabled], keyframeStates)).toBe(keyframeStates)
  })

  test("overrides a keyframed value, because audio wins", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: numberParam.max ?? 1,
      outMin: numberParam.min ?? 0,
    })

    const keyframeStates: EvaluatedLayerState[] = [
      {
        layerId: layer.id,
        params: { [numberParam.key]: 0 },
        properties: {},
      },
    ]

    const states = apply([layer], [link], keyframeStates, 1)

    expect(states[0]?.params[numberParam.key]).toBe(numberParam.max)
  })

  test("preserves other keyframed params on the same layer", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    const keyframeStates: EvaluatedLayerState[] = [
      {
        layerId: layer.id,
        params: { untouched: 7 },
        properties: { opacity: 0.3 },
      },
    ]

    const states = apply([layer], [link], keyframeStates, 1)

    expect(states[0]?.params.untouched).toBe(7)
    expect(states[0]?.properties.opacity).toBe(0.3)
  })

  test("does not mutate the incoming keyframe states", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    const original: EvaluatedLayerState = {
      layerId: layer.id,
      params: { [numberParam.key]: 0 },
      properties: {},
    }

    apply([layer], [link], [original], 1)

    expect(original.params[numberParam.key]).toBe(0)
  })

  test("leaves states for unlinked layers untouched by identity", () => {
    const linked = makeLayer()
    const untouched = { ...makeLayer(), id: "other-layer" }

    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: linked.id,
      outMax: 1,
      outMin: 0,
    })

    const linkedState: EvaluatedLayerState = {
      layerId: linked.id,
      params: {},
      properties: {},
    }
    const untouchedState: EvaluatedLayerState = {
      layerId: untouched.id,
      params: { a: 1 },
      properties: {},
    }

    const states = apply(
      [linked, untouched],
      [link],
      [linkedState, untouchedState],
      1
    )

    expect(states[1]).toBe(untouchedState)
    expect(states[0]).not.toBe(linkedState)
  })

  test("two links on one layer both land on the same state", () => {
    const layer = makeLayer()

    const first = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: numberParam.max ?? 1,
      outMin: numberParam.min ?? 0,
    })
    const second = createAudioLink({
      band: "mid",
      binding: { kind: "layer", label: "Opacity", property: "opacity", valueType: "number" },
      id: "l2",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    const states = apply([layer], [first, second], [], 1)

    expect(states).toHaveLength(1)
    expect(states[0]?.params[numberParam.key]).toBe(numberParam.max)
    expect(states[0]?.properties.opacity).toBe(1)
  })

  test("ignores links pointing at a deleted layer", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: "does-not-exist",
      outMax: 1,
      outMin: 0,
    })

    expect(apply([layer], [link], [], 1)).toHaveLength(0)
  })

  test("ignores links on parameters that are not audio-modulatable", () => {
    const layer = makeLayer()
    const colorParam = gradientParams.find((d) => d.type === "color")

    if (!colorParam) {
      throw new Error("expected a colour param in the gradient registry")
    }

    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(colorParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    expect(apply([layer], [link], [], 1)).toHaveLength(0)
  })

  test("ignores links on parameters the layer does not define", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding("definitelyNotAParam"),
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    expect(apply([layer], [link], [], 1)).toHaveLength(0)
  })

  test("routes layer-property bindings into properties", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: {
        kind: "layer",
        label: "Opacity",
        property: "opacity",
        valueType: "number",
      },
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 0,
    })

    const states = apply([layer], [link], [], 1)

    expect(states[0]?.properties.opacity).toBe(1)
    expect(states[0]?.params).toEqual({})
  })

  test("two component links on one vector compose", () => {
    const layer = makeLayer()
    const links = (["x", "y"] as const).map((component, index) =>
      createAudioLink({
        band: "bass",
        binding: paramBinding(vec2Param.key),
        component,
        id: `l${index}`,
        layerId: layer.id,
        outMax: index === 0 ? 1 : -1,
        outMin: index === 0 ? 1 : -1,
      })
    )

    const states = apply([layer], links, [], 1)

    expect(states[0]?.params[vec2Param.key]).toEqual([1, -1])
  })

  test("a component link preserves the keyframed value of the other axis", () => {
    const layer = makeLayer()
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(vec2Param.key),
      component: "x",
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 1,
    })

    const keyframeStates: EvaluatedLayerState[] = [
      {
        layerId: layer.id,
        params: { [vec2Param.key]: [0.1, 0.9] },
        properties: {},
      },
    ]

    const states = apply([layer], [link], keyframeStates, 1)

    expect(states[0]?.params[vec2Param.key]).toEqual([1, 0.9])
  })

  test("ALIASING GUARD: never returns or mutates a tuple owned by the layer store", () => {
    const layer = makeLayer()
    const storedTuple = layer.params[vec2Param.key]
    const snapshot = Array.isArray(storedTuple) ? [...storedTuple] : null

    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(vec2Param.key),
      component: "x",
      id: "l1",
      layerId: layer.id,
      outMax: 1,
      outMin: 1,
    })

    const states = apply([layer], [link], [], 1)
    const result = states[0]?.params[vec2Param.key]

    expect(result).not.toBe(storedTuple)
    expect(layer.params[vec2Param.key]).toEqual(snapshot)
  })

  test("samples the band at the requested time", () => {
    const layer = makeLayer()
    const low = numberParam.min ?? 0
    const high = numberParam.max ?? 1
    const link = createAudioLink({
      band: "bass",
      binding: paramBinding(numberParam.key),
      id: "l1",
      layerId: layer.id,
      outMax: high,
      outMin: low,
    })

    const envelopes: AudioEnvelopeSet = {
      bands: {
        bass: Float32Array.from([0, 1]),
        high: Float32Array.from([0, 0]),
        level: Float32Array.from([0, 0]),
        mid: Float32Array.from([0, 0]),
      },
      durationSeconds: 2 / 60,
      envelopeRate: 60,
      sampleCount: 2,
      silentBands: [],
    }

    const atStart = applyAudioModulation(
      [layer],
      [],
      { envelopes, links: [link], offsetSeconds: 0 },
      0
    )
    const atEnd = applyAudioModulation(
      [layer],
      [],
      { envelopes, links: [link], offsetSeconds: 0 },
      1 / 60
    )

    expect(atStart[0]?.params[numberParam.key]).toBe(low)
    expect(atEnd[0]?.params[numberParam.key]).toBe(high)
  })
})
