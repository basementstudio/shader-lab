import type { SceneLineage } from "@/lib/community/scenes"

export function lineageAuthorName(lineage: SceneLineage): string {
  return lineage.authorName ?? `@${lineage.authorHandle}`
}

export function isSelfRemix(
  authorHandle: string,
  lineage: SceneLineage
): boolean {
  return lineage.authorHandle === authorHandle
}

export function lineageLabel(lineage: SceneLineage): string {
  return `Remixed from ${lineageAuthorName(lineage)}: ${lineage.title}`
}
