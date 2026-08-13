import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { getDatabase } from "@/lib/db"
import { profiles, scenes } from "@/lib/db/schema"
import { normalizeHost } from "@/lib/editor/remote-asset"
import { readEnv } from "@/lib/read-env"
import type { LayerType } from "@/types/editor"

export const SCENE_SORTS = ["popular", "latest", "featured"] as const
export type SceneSort = (typeof SCENE_SORTS)[number]

export const DEFAULT_SCENE_SORT: SceneSort = "popular"

export interface CommunitySceneSummary {
  authorAvatarUrl: string | null
  authorHandle: string
  authorName: string | null
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

  const host = normalizeHost(readEnv("NEXT_PUBLIC_R2_PUBLIC_HOST") ?? "")

  return host ? `https://${host}/${labKey.replace(/^\/+/, "")}` : labKey
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

  const host = normalizeHost(readEnv("NEXT_PUBLIC_CF_IMAGES_HOST") ?? "")
  const accountHash = readEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH")

  if (!(host && accountHash)) {
    return null
  }

  return `https://${host}/${accountHash}/${thumbnailImageId}/grid`
}

const summaryColumns = {
  authorAvatarUrl: profiles.avatarUrl,
  authorHandle: profiles.handle,
  authorName: profiles.displayName,
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
  authorAvatarUrl: string | null
  authorHandle: string
  authorName: string | null
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
    authorAvatarUrl: row.authorAvatarUrl,
    authorHandle: row.authorHandle,
    authorName: row.authorName,
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function listPublishedScenes(options?: {
  limit?: number
  query?: string
  sort?: SceneSort
}): Promise<CommunitySceneSummary[]> {
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 60)
  const sort = options?.sort ?? DEFAULT_SCENE_SORT
  const query = options?.query?.trim() ?? ""

  const orderBy = buildOrderBy(sort)
  const filters = [eq(scenes.status, "published"), isNull(scenes.deletedAt)]

  if (sort === "featured") {
    filters.push(sql`${scenes.featuredAt} is not null`)
  }

  if (query.length > 0) {
    const pattern = `%${escapeLike(query)}%`
    const match = or(
      ilike(scenes.title, pattern),
      ilike(profiles.handle, pattern),
      ilike(profiles.displayName, pattern)
    )

    if (match) {
      filters.push(match)
    }
  }

  const where = and(...filters)

  const rows = await getDatabase()
    .select(summaryColumns)
    .from(scenes)
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)

  return rows.map(toSummary)
}

export interface AuthoredScene extends CommunitySceneSummary {
  status: string
}

export async function listScenesByAuthor(
  authorId: string,
  limit = 60
): Promise<AuthoredScene[]> {
  const rows = await getDatabase()
    .select({ ...summaryColumns, status: scenes.status })
    .from(scenes)
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(and(eq(scenes.authorId, authorId), isNull(scenes.deletedAt)))
    .orderBy(desc(scenes.publishedAt), desc(scenes.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100))

  return rows.map((row) => ({ ...toSummary(row), status: row.status }))
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
    .where(
      and(
        eq(scenes.slug, slug),
        eq(scenes.status, "published"),
        isNull(scenes.deletedAt)
      )
    )
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
