import type { EditorAsset, EditorLayer } from "@/types/editor"

export const DEFAULT_DURATION = 6
export const MIN_DURATION = 0.25
export const MAX_DURATION = 1800

export function clampDuration(duration: number): number {
  if (!Number.isFinite(duration)) {
    return DEFAULT_DURATION
  }

  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration))
}

export function getLongestVideoLayerDuration(
  layers: readonly EditorLayer[],
  assets: readonly EditorAsset[]
): number | null {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  let longestDuration = 0

  for (const layer of layers) {
    if (!(layer.kind === "source" && layer.type === "video" && layer.assetId)) {
      continue
    }

    const duration = assetsById.get(layer.assetId)?.duration

    if (
      !(
        typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration > 0
      )
    ) {
      continue
    }

    longestDuration = Math.max(longestDuration, duration)
  }

  return longestDuration > 0 ? clampDuration(longestDuration) : null
}

export function getEffectiveTimelineDuration(
  layers: readonly EditorLayer[],
  assets: readonly EditorAsset[],
  manualDuration: number
): number {
  return getLongestVideoLayerDuration(layers, assets) ?? manualDuration
}
