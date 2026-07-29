import { subscribeToCustomShaderCompiles } from "@/lib/agent-bridge/compile-events"
import { pumpAgentFrame } from "@/lib/agent-bridge/frame-pump"
import { getLayerDefinition, getLayerDefinitions } from "@/lib/editor/config/layer-registry"
import { isParameterAnimatable } from "@/lib/editor/parameter-schema"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import type {
  BlendMode,
  EditorLayer,
  LayerCompositeMode,
  LayerType,
  MaskMode,
  MaskSource,
  ParameterDefinition,
  ParameterValue,
} from "@/types/editor"
import {
  BLEND_MODES,
  LAYER_COMPOSITE_MODES,
  MASK_MODES,
  MASK_SOURCES,
} from "@/types/editor"

export class AgentCommandError extends Error {}

const CUSTOM_SHADER_COMPILE_TIMEOUT_MS = 10_000

type CommandPayload = Record<string, unknown>
type CommandHandler = (payload: CommandPayload) => Promise<unknown> | unknown

function requireString(payload: CommandPayload, key: string): string {
  const value = payload[key]

  if (typeof value !== "string" || value.length === 0) {
    throw new AgentCommandError(`\`${key}\` must be a non-empty string.`)
  }

  return value
}

function optionalString(
  payload: CommandPayload,
  key: string
): string | undefined {
  const value = payload[key]

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new AgentCommandError(`\`${key}\` must be a string.`)
  }

  return value
}

function requireBoolean(payload: CommandPayload, key: string): boolean {
  const value = payload[key]

  if (typeof value !== "boolean") {
    throw new AgentCommandError(`\`${key}\` must be a boolean.`)
  }

  return value
}

function optionalBoolean(
  payload: CommandPayload,
  key: string
): boolean | undefined {
  const value = payload[key]

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "boolean") {
    throw new AgentCommandError(`\`${key}\` must be a boolean.`)
  }

  return value
}

function requireNumber(payload: CommandPayload, key: string): number {
  const value = payload[key]

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AgentCommandError(`\`${key}\` must be a finite number.`)
  }

  return value
}

function optionalNumber(
  payload: CommandPayload,
  key: string
): number | undefined {
  const value = payload[key]

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AgentCommandError(`\`${key}\` must be a finite number.`)
  }

  return value
}

function requireStringArray(payload: CommandPayload, key: string): string[] {
  const value = payload[key]

  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new AgentCommandError(
      `\`${key}\` must be a non-empty array of strings.`
    )
  }

  return value as string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getKnownLayerTypes(): LayerType[] {
  return getLayerDefinitions().map((definition) => definition.type)
}

function requireLayerType(payload: CommandPayload, key: string): LayerType {
  const value = requireString(payload, key)
  const knownTypes = getKnownLayerTypes()

  if (!knownTypes.includes(value as LayerType)) {
    throw new AgentCommandError(
      `Unknown layer type \`${value}\`. Valid types: ${knownTypes.join(", ")}.`
    )
  }

  return value as LayerType
}

function requireLayer(id: string): EditorLayer {
  const layer = useLayerStore.getState().getLayerById(id)

  if (!layer) {
    const ids = useLayerStore
      .getState()
      .layers.map((entry) => entry.id)
      .join(", ")

    throw new AgentCommandError(
      `No layer with id \`${id}\`. Current layer ids: ${ids || "(none)"}.`
    )
  }

  return layer
}

function isInternalParameter(definition: ParameterDefinition): boolean {
  return definition.visibleWhen?.key.startsWith("__") ?? false
}

function summarizeLayer(layer: EditorLayer, index: number) {
  return {
    assetId: layer.assetId,
    blendMode: layer.blendMode,
    compositeMode: layer.compositeMode,
    id: layer.id,
    index,
    kind: layer.kind,
    locked: layer.locked,
    name: layer.name,
    opacity: layer.opacity,
    runtimeError: layer.runtimeError,
    type: layer.type,
    visible: layer.visible,
  }
}

function serializeParameterDefinition(definition: ParameterDefinition) {
  const serialized: Record<string, unknown> = {
    animatable: isParameterAnimatable(definition),
    defaultValue: definition.defaultValue,
    key: definition.key,
    label: definition.label,
    type: definition.type,
  }

  if (definition.description) {
    serialized.description = definition.description
  }

  if (definition.group) {
    serialized.group = definition.group
  }

  if (
    definition.type === "number" ||
    definition.type === "vec2" ||
    definition.type === "vec3"
  ) {
    if (definition.min !== undefined) {
      serialized.min = definition.min
    }

    if (definition.max !== undefined) {
      serialized.max = definition.max
    }

    if (definition.step !== undefined) {
      serialized.step = definition.step
    }
  }

  if (definition.type === "number" && definition.unit !== undefined) {
    serialized.unit = definition.unit
  }

  if (definition.type === "select") {
    serialized.options = definition.options.map((option) => ({
      label: option.label,
      value: option.value,
    }))
  }

  if (definition.type === "text" && definition.maxLength !== undefined) {
    serialized.maxLength = definition.maxLength
  }

  return serialized
}

interface ParamUpdateReport {
  applied: string[]
  clamped: { from: unknown; key: string; to: ParameterValue }[]
  rejected: { key: string; reason: string }[]
}

function clampNumber(value: number, min?: number, max?: number): number {
  let next = value

  if (min !== undefined) {
    next = Math.max(min, next)
  }

  if (max !== undefined) {
    next = Math.min(max, next)
  }

  return next
}

function coerceParameterValue(
  definition: ParameterDefinition,
  value: unknown
): { reason?: string; value?: ParameterValue } {
  switch (definition.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { reason: "expected a finite number" }
      }

      return { value: clampNumber(value, definition.min, definition.max) }
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return { reason: "expected a boolean" }
      }

      return { value }
    }
    case "select": {
      const validValues = definition.options.map((option) => option.value)

      if (typeof value !== "string" || !validValues.includes(value)) {
        return {
          reason: `expected one of: ${validValues.join(", ")}`,
        }
      }

      return { value }
    }
    case "color": {
      if (typeof value !== "string" || !value.startsWith("#")) {
        return { reason: "expected a hex color string like #ff8800" }
      }

      return { value }
    }
    case "text": {
      if (typeof value !== "string") {
        return { reason: "expected a string" }
      }

      if (
        definition.maxLength !== undefined &&
        value.length > definition.maxLength
      ) {
        return { value: value.slice(0, definition.maxLength) }
      }

      return { value }
    }
    case "vec2":
    case "vec3": {
      const expectedLength = definition.type === "vec2" ? 2 : 3

      if (
        !Array.isArray(value) ||
        value.length !== expectedLength ||
        value.some(
          (entry) => typeof entry !== "number" || !Number.isFinite(entry)
        )
      ) {
        return {
          reason: `expected an array of ${expectedLength} finite numbers`,
        }
      }

      const clampedEntries = (value as number[]).map((entry) =>
        clampNumber(entry, definition.min, definition.max)
      )

      return {
        value:
          definition.type === "vec2"
            ? ([clampedEntries[0] ?? 0, clampedEntries[1] ?? 0] as [
                number,
                number,
              ])
            : ([
                clampedEntries[0] ?? 0,
                clampedEntries[1] ?? 0,
                clampedEntries[2] ?? 0,
              ] as [number, number, number]),
      }
    }
    default:
      return { reason: "unsupported parameter type" }
  }
}

function isSameParameterValue(left: ParameterValue, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => entry === right[index])
    )
  }

  return left === right
}

function updateLayerParams(
  layer: EditorLayer,
  params: Record<string, unknown>
): ParamUpdateReport {
  const definitions = getLayerDefinition(layer.type).params
  const report: ParamUpdateReport = {
    applied: [],
    clamped: [],
    rejected: [],
  }

  for (const [key, rawValue] of Object.entries(params)) {
    const definition = definitions.find((entry) => entry.key === key)

    if (!definition) {
      const validKeys = definitions
        .filter((entry) => !isInternalParameter(entry))
        .map((entry) => entry.key)
        .join(", ")

      report.rejected.push({
        key,
        reason: `unknown parameter for \`${layer.type}\`. Valid keys: ${validKeys}`,
      })
      continue
    }

    const coerced = coerceParameterValue(definition, rawValue)

    if (coerced.value === undefined) {
      report.rejected.push({
        key,
        reason: coerced.reason ?? "invalid value",
      })
      continue
    }

    if (!isSameParameterValue(coerced.value, rawValue)) {
      report.clamped.push({ from: rawValue, key, to: coerced.value })
    }

    useLayerStore.getState().updateLayerParam(layer.id, key, coerced.value)
    report.applied.push(key)
  }

  return report
}

function getProjectState() {
  const layerState = useLayerStore.getState()
  const editorState = useEditorStore.getState()

  return {
    compositionSize: editorState.outputSize,
    layers: layerState.layers.map(summarizeLayer),
    selectedLayerId: layerState.selectedLayerId,
  }
}

function serializeLayer(layer: EditorLayer) {
  const index = useLayerStore
    .getState()
    .layers.findIndex((entry) => entry.id === layer.id)

  return {
    ...summarizeLayer(layer, index),
    hue: layer.hue,
    maskConfig: layer.maskConfig,
    params: { ...layer.params },
    saturation: layer.saturation,
  }
}

interface CompileWaitResult {
  error: string | null
  timedOut: boolean
}

function waitForCompileResult(
  layerId: string,
  revision: number,
  timeoutMs: number
): Promise<CompileWaitResult> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null
    const timer = setTimeout(() => {
      unsubscribe?.()
      resolve({ error: null, timedOut: true })
    }, timeoutMs)

    unsubscribe = subscribeToCustomShaderCompiles((result) => {
      if (result.layerId !== layerId || result.revision < revision) {
        return
      }

      clearTimeout(timer)
      unsubscribe?.()
      resolve({ error: result.error, timedOut: false })
    })
  })
}

async function writeCustomShader(payload: CommandPayload) {
  const sourceCode = requireString(payload, "sourceCode")
  const providedLayerId = optionalString(payload, "layerId")
  const effectMode = optionalBoolean(payload, "effectMode")

  let layerId = providedLayerId

  if (layerId) {
    const layer = requireLayer(layerId)

    if (layer.type !== "custom-shader") {
      throw new AgentCommandError(
        `Layer \`${layerId}\` is a \`${layer.type}\` layer, not a custom shader. Omit layerId to create a new custom shader layer.`
      )
    }
  } else {
    layerId = useLayerStore.getState().addLayer("custom-shader")
  }

  const store = useLayerStore.getState()

  if (effectMode !== undefined) {
    store.updateLayerParam(layerId, "effectMode", effectMode)
  }

  const layer = requireLayer(layerId)
  const currentRevision =
    typeof layer.params.sourceRevision === "number"
      ? layer.params.sourceRevision
      : 0
  const revision = currentRevision + 1
  const compileResult = waitForCompileResult(
    layerId,
    revision,
    CUSTOM_SHADER_COMPILE_TIMEOUT_MS
  )

  store.updateLayerParam(layerId, "sourceMode", "paste")
  store.updateLayerParam(layerId, "sourceCode", sourceCode)
  store.updateLayerParam(layerId, "sourceRevision", revision)

  pumpAgentFrame()

  const result = await compileResult

  pumpAgentFrame()

  if (result.timedOut) {
    return {
      compiled: false,
      error:
        "Timed out waiting for the shader compile. Make sure the layer is visible and the editor tab is rendering (not in a background tab).",
      layerId,
      revision,
      timedOut: true,
    }
  }

  return {
    compiled: result.error === null,
    error: result.error,
    layerId,
    revision,
    timedOut: false,
  }
}

function getCustomShader(payload: CommandPayload) {
  const layer = requireLayer(requireString(payload, "layerId"))

  if (layer.type !== "custom-shader") {
    throw new AgentCommandError(
      `Layer \`${layer.id}\` is a \`${layer.type}\` layer, not a custom shader.`
    )
  }

  return {
    effectMode: layer.params.effectMode === true,
    entryExport: layer.params.entryExport,
    layerId: layer.id,
    revision: layer.params.sourceRevision,
    runtimeError: layer.runtimeError,
    sourceCode: layer.params.sourceCode,
  }
}

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  svg: "image/svg+xml",
  webm: "video/webm",
  webp: "image/webp",
}

async function addMediaLayer(payload: CommandPayload) {
  const fileName = requireString(payload, "fileName")
  const base64 = requireString(payload, "base64")
  const insertIndex = optionalNumber(payload, "insertIndex")
  const name = optionalString(payload, "name")
  const extension = fileName.split(".").pop()?.toLowerCase() ?? ""
  const mimeType = MEDIA_MIME_BY_EXTENSION[extension]

  if (!mimeType) {
    throw new AgentCommandError(
      `Unsupported media extension \`${extension}\`. Supported: ${Object.keys(MEDIA_MIME_BY_EXTENSION).join(", ")}.`
    )
  }

  let buffer: ArrayBuffer

  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    buffer = bytes.buffer as ArrayBuffer
  } catch {
    throw new AgentCommandError("`base64` is not valid base64 data.")
  }

  const file = new File([buffer], fileName, { type: mimeType })
  const { useAssetStore } = await import("@/store/asset-store")
  const asset = await useAssetStore
    .getState()
    .loadAsset(file)
    .catch((error: unknown) => {
      throw new AgentCommandError(
        error instanceof Error
          ? error.message
          : "Could not load the media file."
      )
    })

  const layerType: LayerType = asset.kind === "video" ? "video" : "image"
  const store = useLayerStore.getState()
  const layerId = store.addLayer(layerType, insertIndex)

  store.setLayerAsset(layerId, asset.id)

  if (name) {
    store.renameLayer(layerId, name)
  }

  return serializeLayer(requireLayer(layerId))
}

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  add_layer: (payload) => {
    const type = requireLayerType(payload, "type")
    const insertIndex = optionalNumber(payload, "insertIndex")
    const name = optionalString(payload, "name")
    const store = useLayerStore.getState()
    const id = store.addLayer(type, insertIndex)

    if (name) {
      store.renameLayer(id, name)
    }

    const layer = requireLayer(id)

    return serializeLayer(layer)
  },

  describe_layer_type: (payload) => {
    const type = requireLayerType(payload, "type")
    const definition = getLayerDefinition(type)
    const visibleParams = definition.params.filter(
      (entry) => !isInternalParameter(entry)
    )
    const internalParamKeys = definition.params
      .filter((entry) => isInternalParameter(entry))
      .map((entry) => entry.key)

    return {
      defaultName: definition.defaultName,
      internalParamKeys,
      kind: definition.kind,
      params: visibleParams.map(serializeParameterDefinition),
      requiresAssetKind: definition.assetKind ?? null,
      type: definition.type,
    }
  },

  add_media_layer: addMediaLayer,

  duplicate_layer: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const newId = useLayerStore.getState().duplicateLayer(layer.id)

    if (!newId) {
      throw new AgentCommandError(`Could not duplicate layer \`${layer.id}\`.`)
    }

    return serializeLayer(requireLayer(newId))
  },

  get_custom_shader: getCustomShader,

  get_layer: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))

    return serializeLayer(layer)
  },

  get_project_state: () => getProjectState(),

  list_layer_types: () =>
    getLayerDefinitions().map((definition) => ({
      defaultName: definition.defaultName,
      kind: definition.kind,
      paramCount: definition.params.length,
      requiresAssetKind: definition.assetKind ?? null,
      type: definition.type,
    })),

  remove_layers: (payload) => {
    const ids = requireStringArray(payload, "ids")
    const missing = ids.filter(
      (id) => !useLayerStore.getState().getLayerById(id)
    )

    if (missing.length > 0) {
      throw new AgentCommandError(
        `No layer with id(s): ${missing.join(", ")}. Nothing was removed.`
      )
    }

    useLayerStore.getState().removeLayers(ids)

    return getProjectState()
  },

  rename_layer: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const name = requireString(payload, "name")

    useLayerStore.getState().renameLayer(layer.id, name)

    return serializeLayer(requireLayer(layer.id))
  },

  reorder_layer: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const toIndex = requireNumber(payload, "toIndex")
    const layers = useLayerStore.getState().layers
    const fromIndex = layers.findIndex((entry) => entry.id === layer.id)

    if (
      !Number.isInteger(toIndex) ||
      toIndex < 0 ||
      toIndex >= layers.length
    ) {
      throw new AgentCommandError(
        `\`toIndex\` must be an integer between 0 and ${layers.length - 1}.`
      )
    }

    useLayerStore.getState().reorderLayers(fromIndex, toIndex)

    return getProjectState()
  },

  reset_layer_params: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))

    useLayerStore.getState().resetLayerParams(layer.id)

    return serializeLayer(requireLayer(layer.id))
  },

  screenshot: async (payload) => {
    const { captureScreenshot } = await import("@/lib/agent-bridge/screenshot")

    pumpAgentFrame()

    return captureScreenshot({
      maxWidth: optionalNumber(payload, "maxWidth"),
      time: optionalNumber(payload, "time"),
    })
  },

  select_layer: (payload) => {
    const id = optionalString(payload, "id")

    if (id !== undefined) {
      requireLayer(id)
    }

    useLayerStore.getState().selectLayer(id ?? null)

    return getProjectState()
  },

  set_layer_visibility: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const visible = requireBoolean(payload, "visible")

    useLayerStore.getState().setLayerVisibility(layer.id, visible)

    return serializeLayer(requireLayer(layer.id))
  },

  update_layer: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const store = useLayerStore.getState()
    const opacity = optionalNumber(payload, "opacity")
    const hue = optionalNumber(payload, "hue")
    const saturation = optionalNumber(payload, "saturation")
    const blendMode = optionalString(payload, "blendMode")
    const compositeMode = optionalString(payload, "compositeMode")
    const maskConfig = payload.maskConfig

    if (opacity !== undefined) {
      store.setLayerOpacity(layer.id, opacity)
    }

    if (hue !== undefined) {
      store.setLayerHue(layer.id, hue)
    }

    if (saturation !== undefined) {
      store.setLayerSaturation(layer.id, saturation)
    }

    if (blendMode !== undefined) {
      if (!BLEND_MODES.includes(blendMode as BlendMode)) {
        throw new AgentCommandError(
          `Invalid blendMode. Valid values: ${BLEND_MODES.join(", ")}.`
        )
      }

      store.setLayerBlendMode(layer.id, blendMode as BlendMode)
    }

    if (compositeMode !== undefined) {
      if (
        !LAYER_COMPOSITE_MODES.includes(compositeMode as LayerCompositeMode)
      ) {
        throw new AgentCommandError(
          `Invalid compositeMode. Valid values: ${LAYER_COMPOSITE_MODES.join(", ")}.`
        )
      }

      store.setLayerCompositeMode(layer.id, compositeMode as LayerCompositeMode)
    }

    if (maskConfig !== undefined) {
      if (!isRecord(maskConfig)) {
        throw new AgentCommandError("`maskConfig` must be an object.")
      }

      const updates: {
        invert?: boolean
        mode?: MaskMode
        source?: MaskSource
      } = {}

      if (maskConfig.invert !== undefined) {
        if (typeof maskConfig.invert !== "boolean") {
          throw new AgentCommandError("`maskConfig.invert` must be a boolean.")
        }

        updates.invert = maskConfig.invert
      }

      if (maskConfig.mode !== undefined) {
        if (!MASK_MODES.includes(maskConfig.mode as MaskMode)) {
          throw new AgentCommandError(
            `Invalid maskConfig.mode. Valid values: ${MASK_MODES.join(", ")}.`
          )
        }

        updates.mode = maskConfig.mode as MaskMode
      }

      if (maskConfig.source !== undefined) {
        if (!MASK_SOURCES.includes(maskConfig.source as MaskSource)) {
          throw new AgentCommandError(
            `Invalid maskConfig.source. Valid values: ${MASK_SOURCES.join(", ")}.`
          )
        }

        updates.source = maskConfig.source as MaskSource
      }

      store.setLayerMaskConfig(layer.id, updates)
    }

    return serializeLayer(requireLayer(layer.id))
  },

  update_layer_params: (payload) => {
    const layer = requireLayer(requireString(payload, "id"))
    const params = payload.params

    if (!isRecord(params) || Object.keys(params).length === 0) {
      throw new AgentCommandError(
        "`params` must be a non-empty object of key/value pairs."
      )
    }

    const report = updateLayerParams(layer, params)

    return {
      ...report,
      layer: serializeLayer(requireLayer(layer.id)),
    }
  },

  write_custom_shader: writeCustomShader,
}

export function getAgentCommandNames(): string[] {
  return Object.keys(COMMAND_HANDLERS).sort()
}

export async function executeAgentCommand(
  command: string,
  payload: CommandPayload
): Promise<unknown> {
  const handler = COMMAND_HANDLERS[command]

  if (!handler) {
    throw new AgentCommandError(
      `Unknown command \`${command}\`. Available commands: ${getAgentCommandNames().join(", ")}.`
    )
  }

  return await handler(payload)
}
