import { and, desc, eq, sql } from "drizzle-orm"
import { getDatabase } from "@/lib/db"
import { profiles, scenes } from "@/lib/db/schema"
import type { LayerType } from "@/types/editor"

export const SCENE_SORTS = ["latest", "popular", "featured"] as const
export type SceneSort = (typeof SCENE_SORTS)[number]

export interface CommunitySceneSummary {
  authorHandle: string
  compositionHeight: number
  compositionWidth: number
  durationSeconds: number
  hasCustomShader: boolean
  id: string
  layerTypes: LayerType[]
  likeCount: number
  publishedAt: string | null
  remixCount: number
  slug: string
  thumbnailUrl: string | null
  title: string
}

export interface CommunitySceneDetail extends CommunitySceneSummary {
  description: string | null
  forkedFrom: { slug: string; title: string } | null
  labUrl: string
}

export function resolveLabUrl(labKey: string): string {
  if (labKey.startsWith("/") || labKey.startsWith("https://")) {
    return labKey
  }

  const host = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST

  return host ? `https://${host}/${labKey}` : labKey
}

export function resolveThumbnailUrl(
  thumbnailImageId: string | null
): string | null {
  if (!thumbnailImageId) {
    return null
  }

  if (
    thumbnailImageId.startsWith("/") ||
    thumbnailImageId.startsWith("https://")
  ) {
    return thumbnailImageId
  }

  const host = process.env.NEXT_PUBLIC_CF_IMAGES_HOST

  return host ? `https://${host}/${thumbnailImageId}/grid` : null
}

const summaryColumns = {
  authorHandle: profiles.handle,
  compositionHeight: scenes.compositionHeight,
  compositionWidth: scenes.compositionWidth,
  durationSeconds: scenes.durationSeconds,
  hasCustomShader: scenes.hasCustomShader,
  id: scenes.id,
  layerTypes: scenes.layerTypes,
  likeCount: scenes.likeCount,
  publishedAt: scenes.publishedAt,
  remixCount: scenes.remixCount,
  slug: scenes.slug,
  thumbnailImageId: scenes.thumbnailImageId,
  title: scenes.title,
}

function toSummary(row: {
  authorHandle: string
  compositionHeight: number
  compositionWidth: number
  durationSeconds: number
  hasCustomShader: boolean
  id: string
  layerTypes: string[]
  likeCount: number
  publishedAt: Date | null
  remixCount: number
  slug: string
  thumbnailImageId: string | null
  title: string
}): CommunitySceneSummary {
  return {
    authorHandle: row.authorHandle,
    compositionHeight: row.compositionHeight,
    compositionWidth: row.compositionWidth,
    durationSeconds: row.durationSeconds,
    hasCustomShader: row.hasCustomShader,
    id: row.id,
    layerTypes: row.layerTypes as LayerType[],
    likeCount: row.likeCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    remixCount: row.remixCount,
    slug: row.slug,
    thumbnailUrl: resolveThumbnailUrl(row.thumbnailImageId),
    title: row.title,
  }
}

function buildOrderBy(sort: SceneSort) {
  if (sort === "popular") {
    return [desc(scenes.likeCount), desc(scenes.publishedAt)]
  }

  if (sort === "featured") {
    return [desc(scenes.featuredAt), desc(scenes.publishedAt)]
  }

  return [desc(scenes.publishedAt)]
}

export async function listPublishedScenes(options?: {
  limit?: number
  sort?: SceneSort
}): Promise<CommunitySceneSummary[]> {
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 60)
  const sort = options?.sort ?? "latest"

  const orderBy = buildOrderBy(sort)
  const where =
    sort === "featured"
      ? and(
          eq(scenes.status, "published"),
          sql`${scenes.featuredAt} is not null`
        )
      : eq(scenes.status, "published")

  const rows = await getDatabase()
    .select(summaryColumns)
    .from(scenes)
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)

  return rows.map(toSummary)
}

export async function getPublishedScene(
  slug: string
): Promise<CommunitySceneDetail | null> {
  const rows = await getDatabase()
    .select({
      ...summaryColumns,
      description: scenes.description,
      forkedFromId: scenes.forkedFromId,
      labKey: scenes.labKey,
    })
    .from(scenes)
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(and(eq(scenes.slug, slug), eq(scenes.status, "published")))
    .limit(1)

  const row = rows[0]

  if (!row) {
    return null
  }

  let forkedFrom: CommunitySceneDetail["forkedFrom"] = null

  if (row.forkedFromId) {
    const parent = await getDatabase()
      .select({ slug: scenes.slug, title: scenes.title })
      .from(scenes)
      .where(eq(scenes.id, row.forkedFromId))
      .limit(1)

    forkedFrom = parent[0] ?? null
  }

  return {
    ...toSummary(row),
    description: row.description,
    forkedFrom,
    labUrl: resolveLabUrl(row.labKey),
  }
}
