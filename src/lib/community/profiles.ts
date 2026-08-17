import { and, eq, isNull, sql } from "drizzle-orm"
import { getDatabase } from "@/lib/db"
import { handleClaims, profiles, scenes } from "@/lib/db/schema"

export interface PublicProfile {
  avatarUrl: string | null
  displayName: string | null
  handle: string
  joinedAt: string
  publishedCount: number
  remixCount: number
  upvoteCount: number
  userId: string
}

export async function getProfileByHandle(
  handle: string
): Promise<PublicProfile | null> {
  const rows = await getDatabase()
    .select({
      avatarUrl: profiles.avatarUrl,
      displayName: profiles.displayName,
      handle: profiles.handle,
      joinedAt: profiles.createdAt,
      publishedCount: sql<number>`count(${scenes.id})::int`,
      remixCount: sql<number>`coalesce(sum(${scenes.remixCount}), 0)::int`,
      upvoteCount: sql<number>`coalesce(sum(${scenes.likeCount}), 0)::int`,
      userId: profiles.userId,
    })
    .from(profiles)
    .leftJoin(
      scenes,
      and(
        eq(scenes.authorId, profiles.userId),
        eq(scenes.status, "published"),
        isNull(scenes.deletedAt)
      )
    )
    .where(eq(profiles.handle, handle))
    .groupBy(profiles.userId)
    .limit(1)

  const row = rows[0]

  if (!row) {
    return null
  }

  return {
    avatarUrl: row.avatarUrl,
    displayName: row.displayName,
    handle: row.handle,
    joinedAt: row.joinedAt.toISOString(),
    publishedCount: Number(row.publishedCount),
    remixCount: Number(row.remixCount),
    upvoteCount: Number(row.upvoteCount),
    userId: row.userId,
  }
}

export async function findCurrentHandleFor(
  handle: string
): Promise<string | null> {
  const rows = await getDatabase()
    .select({ current: profiles.handle })
    .from(handleClaims)
    .innerJoin(profiles, eq(profiles.userId, handleClaims.userId))
    .where(eq(handleClaims.handle, handle))
    .limit(1)

  const current = rows[0]?.current ?? null

  return current === handle ? null : current
}
