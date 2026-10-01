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
  accessors?: {
    bufferView?: number
    byteOffset?: number
    componentType?: number
    count?: number
    max?: number[]
    type?: string
  }[]
  bufferViews?: {
    buffer?: number
    byteOffset?: number
    byteStride?: number
  }[]
  buffers?: { uri?: string }[]
  animations?: {
    channels?: { sampler?: number; target?: { node?: number } }[]
    name?: string
    samplers?: { input?: number }[]
  }[]
}

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const FLOAT_COMPONENT = 5126
const RESERVED_CLIP_VALUES: readonly string[] = [
  MODEL_ANIMATION_AUTO,
  MODEL_ANIMATION_ALL,
  MODEL_ANIMATION_NONE,
]

export function uniqueClipValues(names: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const used = new Set<string>()
  return names.map((name, index) => {
    let value = name
    if (
      name.length === 0 ||
      (counts.get(name) ?? 0) > 1 ||
      RESERVED_CLIP_VALUES.includes(name)
    ) {
      value = `${name.length > 0 ? name : "animation"}_${index}`
    }
    while (used.has(value)) value = `${value}_`
    used.add(value)
    return value
  })
}

function bufferBytes(
  gltf: GltfJson,
  index: number,
  binary: Uint8Array | null
): Uint8Array | null {
  const uri = gltf.buffers?.[index]?.uri
  if (uri === undefined) return index === 0 ? binary : null
  const match = /^data:[^,]*;base64,(.*)$/.exec(uri)
  if (!match) return null
  const text = atob(match[1] ?? "")
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i)
  return bytes
}

function accessorEnd(
  gltf: GltfJson,
  index: number,
  binary: Uint8Array | null
): number | undefined {
  const accessor = gltf.accessors?.[index]
  if (!accessor) return undefined
  const declared = accessor.max?.[0]
  if (typeof declared === "number" && Number.isFinite(declared)) {
    return declared
  }
  if (
    accessor.componentType !== FLOAT_COMPONENT ||
    accessor.type !== "SCALAR" ||
    typeof accessor.bufferView !== "number" ||
    typeof accessor.count !== "number"
  ) {
    return undefined
  }
  const view = gltf.bufferViews?.[accessor.bufferView]
  const bytes = view ? bufferBytes(gltf, view.buffer ?? 0, binary) : null
  if (!(view && bytes)) return undefined
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : 4
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  if (start + (accessor.count - 1) * stride + 4 > bytes.byteLength) {
    return undefined
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end: number | undefined
  for (let i = 0; i < accessor.count; i += 1) {
    const value = data.getFloat32(start + i * stride, true)
    if (Number.isFinite(value) && (end === undefined || value > end)) {
      end = value
    }
  }
  return end
}

export function clipsFromGltfJson(
  json: unknown,
  binary: Uint8Array | null = null
): ModelClipInfo[] {
  const gltf = (json ?? {}) as GltfJson
  const animations = gltf.animations ?? []
  const rawNames = animations.map((animation) =>
    typeof animation.name === "string" ? animation.name : ""
  )
  const values = uniqueClipValues(rawNames)
  const rawCounts = new Map<string, number>()
  for (const name of rawNames) {
    rawCounts.set(name, (rawCounts.get(name) ?? 0) + 1)
  }
  return animations.map((animation, index) => {
    let duration = 0
    const targets = new Set<number>()
    for (const channel of animation.channels ?? []) {
      const input = animation.samplers?.[channel.sampler ?? -1]?.input
      const end =
        input === undefined ? undefined : accessorEnd(gltf, input, binary)
      if (typeof end === "number" && Number.isFinite(end)) {
        duration = Math.max(duration, end)
      }
      if (typeof channel.target?.node === "number") {
        targets.add(channel.target.node)
      }
    }
    const raw = rawNames[index] ?? ""
    const duplicated = (rawCounts.get(raw) ?? 0) > 1
    const named = duplicated ? `${raw} (${index + 1})` : raw
    return {
      duration,
      label: raw.length === 0 ? `Animation ${index + 1}` : named,
      name: values[index] ?? `animation_${index}`,
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
      let binary: Uint8Array | null = null
      const binaryStart = 20 + length
      if (
        binaryStart + 8 <= buffer.byteLength &&
        view.getUint32(binaryStart + 4, true) === BIN_CHUNK
      ) {
        const binaryLength = Math.min(
          view.getUint32(binaryStart, true),
          buffer.byteLength - binaryStart - 8
        )
        binary = new Uint8Array(buffer, binaryStart + 8, binaryLength)
      }
      return clipsFromGltfJson(JSON.parse(text), binary)
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
