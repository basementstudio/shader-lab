import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm"
import {
  encodeSceneCursor,
  type SceneCursor,
} from "@/lib/community/scene-cursor"
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

export interface SceneLineage {
  authorAvatarUrl: string | null
  authorHandle: string
  authorName: string | null
  slug: string
  title: string
}

export interface CommunitySceneDetail extends CommunitySceneSummary {
  description: string | null
  forkedFrom: SceneLineage | null
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
    return [desc(scenes.likeCount), desc(scenes.publishedAt), desc(scenes.id)]
  }

  if (sort === "featured") {
    return [desc(scenes.featuredAt), desc(scenes.publishedAt), desc(scenes.id)]
  }

  return [desc(scenes.publishedAt), desc(scenes.id)]
}

function buildKeysetFilter(sort: SceneSort, cursor: SceneCursor) {
  const publishedAt = new Date(cursor.publishedAt)

  if (sort === "popular") {
    return sql`(${scenes.likeCount}, ${scenes.publishedAt}, ${scenes.id}) < (${cursor.likeCount}::int, ${publishedAt}::timestamptz, ${cursor.id}::text)`
  }

  return sql`(${scenes.publishedAt}, ${scenes.id}) < (${publishedAt}::timestamptz, ${cursor.id}::text)`
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export interface SceneListPage {
  nextCursor: string | null
  scenes: CommunitySceneSummary[]
}

export async function listPublishedScenes(options?: {
  authorHandle?: string | null
  cursor?: SceneCursor | null
  limit?: number
  query?: string
  sort?: SceneSort
}): Promise<SceneListPage> {
  const limit = Math.min(Math.max(options?.limit ?? 24, 1), 60)
  const sort = options?.sort ?? DEFAULT_SCENE_SORT
  const query = options?.query?.trim() ?? ""

  const orderBy = buildOrderBy(sort)
  const filters = [eq(scenes.status, "published"), isNull(scenes.deletedAt)]

  if (sort === "featured") {
    filters.push(sql`${scenes.featuredAt} is not null`)
  }

  if (options?.authorHandle) {
    filters.push(eq(profiles.handle, options.authorHandle))
  }

  if (options?.cursor) {
    filters.push(buildKeysetFilter(sort, options.cursor))
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
    .select({ ...summaryColumns, publishedAtRaw: scenes.publishedAt })
    .from(scenes)
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(where)
    .orderBy(...orderBy)
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const last = page.at(-1)
  const hasMore = rows.length > limit

  return {
    nextCursor:
      hasMore && last?.publishedAtRaw
        ? encodeSceneCursor({
            id: last.id,
            likeCount: last.likeCount,
            publishedAt: last.publishedAtRaw.toISOString(),
          })
        : null,
    scenes: page.map(toSummary),
  }
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
    .where(
      and(
        eq(scenes.authorId, authorId),
        ne(scenes.status, "draft"),
        isNull(scenes.deletedAt)
      )
    )
    .orderBy(desc(scenes.publishedAt), desc(scenes.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100))

  return rows.map((row) => ({ ...toSummary(row), status: row.status }))
}

export interface DraftSummary {
  compositionHeight: number
  compositionWidth: number
  durationSeconds: number
  id: string
  labUrl: string
  layerTypes: LayerType[]
  thumbnailUrl: string | null
  title: string
  updatedAt: string
}

export async function listDraftsByAuthor(
  authorId: string,
  limit = 60
): Promise<DraftSummary[]> {
  const rows = await getDatabase()
    .select({
      compositionHeight: scenes.compositionHeight,
      compositionWidth: scenes.compositionWidth,
      durationSeconds: scenes.durationSeconds,
      id: scenes.id,
      labKey: scenes.labKey,
      layerTypes: scenes.layerTypes,
      thumbnailImageId: scenes.thumbnailImageId,
      title: scenes.title,
      updatedAt: scenes.updatedAt,
    })
    .from(scenes)
    .where(
      and(
        eq(scenes.authorId, authorId),
        eq(scenes.status, "draft"),
        isNull(scenes.deletedAt)
      )
    )
    .orderBy(desc(scenes.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100))

  return rows.map((row) => ({
    compositionHeight: row.compositionHeight,
    compositionWidth: row.compositionWidth,
    durationSeconds: row.durationSeconds,
    id: row.id,
    labUrl: resolveLabUrl(row.labKey),
    layerTypes: row.layerTypes as LayerType[],
    thumbnailUrl: resolveThumbnailUrl(row.thumbnailImageId),
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export interface AuthoredSceneDetail {
  authorId: string
  detail: CommunitySceneDetail
}

export async function getPublishedScene(
  slug: string
): Promise<CommunitySceneDetail | null> {
  return (await getPublishedSceneWithAuthor(slug))?.detail ?? null
}

export async function getPublishedSceneWithAuthor(
  slug: string
): Promise<AuthoredSceneDetail | null> {
  const rows = await getDatabase()
    .select({
      ...summaryColumns,
      authorId: scenes.authorId,
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

  let forkedFrom: SceneLineage | null = null

  if (row.forkedFromId) {
    const parent = await getDatabase()
      .select({
        authorAvatarUrl: profiles.avatarUrl,
        authorHandle: profiles.handle,
        authorName: profiles.displayName,
        slug: scenes.slug,
        title: scenes.title,
      })
      .from(scenes)
      .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
      .where(
        and(
          eq(scenes.id, row.forkedFromId),
          eq(scenes.status, "published"),
          isNull(scenes.deletedAt)
        )
      )
      .limit(1)

    forkedFrom = parent[0] ?? null
  }

  return {
    authorId: row.authorId,
    detail: {
      ...toSummary(row),
      description: row.description,
      forkedFrom,
      labUrl: resolveLabUrl(row.labKey),
    },
  }
}
