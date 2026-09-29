import type { LayerParameterValues } from "@/types/editor"

export type ModelClipInfo = {
  duration: number
  label: string
  name: string
  targets: readonly number[]
}

export const MODEL_ANIMATION_AUTO = "auto"
export const MODEL_ANIMATION_ALL = "all"
export const MODEL_ANIMATION_NONE = "none"

export const MODEL_ANIMATION_REPEATS = [
  { id: "loop", label: "Loop" },
  { id: "pingpong", label: "Ping-Pong" },
  { id: "once", label: "Once" },
] as const

export type ModelAnimationRepeat = (typeof MODEL_ANIMATION_REPEATS)[number]["id"]

export type ModelAnimationSettings = {
  playing: boolean
  repeat: ModelAnimationRepeat
  speed: number
  start: number
}

type GltfJson = {
  accessors?: { max?: number[] }[]
  animations?: {
    channels?: { sampler?: number; target?: { node?: number } }[]
    name?: string
    samplers?: { input?: number }[]
  }[]
}

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a

export function clipsFromGltfJson(json: unknown): ModelClipInfo[] {
  const gltf = (json ?? {}) as GltfJson
  const accessors = gltf.accessors ?? []
  return (gltf.animations ?? []).map((animation, index) => {
    let duration = 0
    const targets = new Set<number>()
    for (const channel of animation.channels ?? []) {
      const input = animation.samplers?.[channel.sampler ?? -1]?.input
      const end = input === undefined ? undefined : accessors[input]?.max?.[0]
      if (typeof end === "number" && Number.isFinite(end)) {
        duration = Math.max(duration, end)
      }
      if (typeof channel.target?.node === "number") {
        targets.add(channel.target.node)
      }
    }
    const named = typeof animation.name === "string" && animation.name.length > 0
    return {
      duration,
      label: named ? (animation.name as string) : `Animation ${index + 1}`,
      name: named ? (animation.name as string) : `animation_${index}`,
      targets: [...targets],
    }
  })
}

export function parseGltfClips(buffer: ArrayBuffer): ModelClipInfo[] {
  const view = new DataView(buffer)
  try {
    if (buffer.byteLength >= 20 && view.getUint32(0, true) === GLB_MAGIC) {
      const length = view.getUint32(12, true)
      if (view.getUint32(16, true) !== JSON_CHUNK) return []
      const text = new TextDecoder().decode(new Uint8Array(buffer, 20, length))
      return clipsFromGltfJson(JSON.parse(text))
    }
    return clipsFromGltfJson(JSON.parse(new TextDecoder().decode(buffer)))
  } catch {
    return []
  }
}

function clipsShareTargets(clips: readonly ModelClipInfo[]): boolean {
  const seen = new Set<number>()
  for (const clip of clips) {
    for (const target of clip.targets) {
      if (seen.has(target)) return true
    }
    for (const target of clip.targets) seen.add(target)
  }
  return false
}

export function resolveModelClips(
  value: unknown,
  clips: readonly ModelClipInfo[]
): number[] {
  if (clips.length === 0 || value === MODEL_ANIMATION_NONE) return []
  if (value === MODEL_ANIMATION_ALL) return clips.map((_, index) => index)
  const named = clips.findIndex((clip) => clip.name === value)
  if (named >= 0) return [named]
  return clips.length > 1 && !clipsShareTargets(clips)
    ? clips.map((_, index) => index)
    : [0]
}

export function modelSelectionValue(
  value: unknown,
  clips: readonly ModelClipInfo[]
): string {
  const indices = resolveModelClips(value, clips)
  if (indices.length === 0) return MODEL_ANIMATION_NONE
  if (indices.length > 1) return MODEL_ANIMATION_ALL
  return clips[indices[0] ?? 0]?.name ?? MODEL_ANIMATION_NONE
}

export function modelSelectionDuration(
  value: unknown,
  clips: readonly ModelClipInfo[]
): number {
  return resolveModelClips(value, clips).reduce(
    (longest, index) => Math.max(longest, clips[index]?.duration ?? 0),
    0
  )
}

function readFinite(value: unknown, fallback: number, low: number, high: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback
}

export function readModelAnimation(
  params: LayerParameterValues
): ModelAnimationSettings {
  const repeat =
    MODEL_ANIMATION_REPEATS.find((entry) => entry.id === params.animationRepeat)
      ?.id ?? "loop"
  return {
    playing: params.animationPlaying !== false,
    repeat,
    speed: readFinite(params.animationSpeed, 1, 0, 4),
    start: readFinite(params.animationStart, 0, 0, 3600),
  }
}

export function modelClipTime(
  settings: ModelAnimationSettings,
  time: number,
  duration: number
): number {
  if (!(duration > 0)) return 0
  const elapsed = settings.playing ? settings.start + time * settings.speed : settings.start
  if (settings.repeat === "once") {
    return Math.min(duration, Math.max(0, elapsed))
  }
  if (settings.repeat === "pingpong") {
    const period = duration * 2
    const phase = ((elapsed % period) + period) % period
    return phase > duration ? period - phase : phase
  }
  return ((elapsed % duration) + duration) % duration
}
