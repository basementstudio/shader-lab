import { and, eq, isNull, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDatabase } from "@/lib/db"
import { likes, remixes, scenes } from "@/lib/db/schema"

const ANON_ACTOR = /^[A-Za-z0-9_-]{8,40}$/

export function dayBucketFor(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function resolveActorKey(input: {
  anonId: unknown
  userId: string | null
}): string | null {
  if (input.userId) {
    return `user:${input.userId}`
  }

  if (typeof input.anonId === "string" && ANON_ACTOR.test(input.anonId)) {
    return `anon:${input.anonId}`
  }

  return null
}

async function findLiveScene(slug: string): Promise<{ id: string } | null> {
  const rows = await getDatabase()
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        eq(scenes.slug, slug),
        eq(scenes.status, "published"),
        isNull(scenes.deletedAt)
      )
    )
    .limit(1)

  return rows[0] ?? null
}

export async function recordRemix(input: {
  actorKey: string
  slug: string
  when: Date
}): Promise<{ counted: boolean; remixCount: number } | null> {
  const db = getDatabase()
  const scene = await findLiveScene(input.slug)

  if (!scene) {
    return null
  }

  const inserted = await db
    .insert(remixes)
    .values({
      actorKey: input.actorKey,
      dayBucket: dayBucketFor(input.when),
      id: `rmx_${nanoid(16)}`,
      sceneId: scene.id,
    })
    .onConflictDoNothing()
    .returning({ id: remixes.id })

  if (inserted.length === 0) {
    const current = await db
      .select({ remixCount: scenes.remixCount })
      .from(scenes)
      .where(eq(scenes.id, scene.id))
      .limit(1)

    return { counted: false, remixCount: current[0]?.remixCount ?? 0 }
  }

  const updated = await db
    .update(scenes)
    .set({ remixCount: sql`${scenes.remixCount} + 1` })
    .where(eq(scenes.id, scene.id))
    .returning({ remixCount: scenes.remixCount })

  return { counted: true, remixCount: updated[0]?.remixCount ?? 0 }
}

export async function toggleLike(input: {
  slug: string
  userId: string
}): Promise<{ likeCount: number; liked: boolean } | null> {
  const db = getDatabase()
  const scene = await findLiveScene(input.slug)

  if (!scene) {
    return null
  }

  const inserted = await db
    .insert(likes)
    .values({ sceneId: scene.id, userId: input.userId })
    .onConflictDoNothing()
    .returning({ sceneId: likes.sceneId })

  if (inserted.length > 0) {
    const updated = await db
      .update(scenes)
      .set({ likeCount: sql`${scenes.likeCount} + 1` })
      .where(eq(scenes.id, scene.id))
      .returning({ likeCount: scenes.likeCount })

    return { likeCount: updated[0]?.likeCount ?? 0, liked: true }
  }

  const removed = await db
    .delete(likes)
    .where(and(eq(likes.sceneId, scene.id), eq(likes.userId, input.userId)))
    .returning({ sceneId: likes.sceneId })

  if (removed.length === 0) {
    const current = await db
      .select({ likeCount: scenes.likeCount })
      .from(scenes)
      .where(eq(scenes.id, scene.id))
      .limit(1)

    return { likeCount: current[0]?.likeCount ?? 0, liked: false }
  }

  const updated = await db
    .update(scenes)
    .set({ likeCount: sql`greatest(${scenes.likeCount} - 1, 0)` })
    .where(eq(scenes.id, scene.id))
    .returning({ likeCount: scenes.likeCount })

  return { likeCount: updated[0]?.likeCount ?? 0, liked: false }
}

export async function listLikedSlugs(userId: string): Promise<string[]> {
  const rows = await getDatabase()
    .select({ slug: scenes.slug })
    .from(likes)
    .innerJoin(scenes, eq(scenes.id, likes.sceneId))
    .where(eq(likes.userId, userId))

  return rows.map((row) => row.slug)
}
