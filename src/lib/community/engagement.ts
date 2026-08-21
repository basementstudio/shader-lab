import { createHmac } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { getDatabase } from "@/lib/db"
import { likes, remixes, scenes } from "@/lib/db/schema"
import { readEnv } from "@/lib/read-env"

const PLATFORM_CLIENT_IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-real-ip",
  "x-forwarded-for",
] as const

const UNKNOWN_CLIENT_IP = "no-client-ip"

export function dayBucketFor(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function readPlatformClientIp(headers: Headers): string | null {
  for (const name of PLATFORM_CLIENT_IP_HEADERS) {
    const nearestClient = headers
      .get(name)
      ?.split(",")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0)

    if (nearestClient) {
      return nearestClient
    }
  }

  return null
}

export function resolveActorKey(input: {
  clientIp: string | null
  userId: string | null
  when: Date
}): string {
  if (input.userId) {
    return `user:${input.userId}`
  }

  const digest = createHmac("sha256", readEnv("NEON_AUTH_COOKIE_SECRET") ?? "")
    .update(
      `remix-actor|${dayBucketFor(input.when)}|${input.clientIp ?? UNKNOWN_CLIENT_IP}`
    )
    .digest("base64url")

  return `anon:${digest}`
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

export function likeCountFromRows(sceneId: string) {
  return sql`(select count(*) from ${likes} where ${likes.sceneId} = ${sceneId})`
}

async function settleLikeCount(sceneId: string): Promise<number> {
  const updated = await getDatabase()
    .update(scenes)
    .set({ likeCount: likeCountFromRows(sceneId) })
    .where(eq(scenes.id, sceneId))
    .returning({ likeCount: scenes.likeCount })

  return updated[0]?.likeCount ?? 0
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
    return { likeCount: await settleLikeCount(scene.id), liked: true }
  }

  await db
    .delete(likes)
    .where(and(eq(likes.sceneId, scene.id), eq(likes.userId, input.userId)))

  return { likeCount: await settleLikeCount(scene.id), liked: false }
}

export async function listLikedSlugs(userId: string): Promise<string[]> {
  const rows = await getDatabase()
    .select({ slug: scenes.slug })
    .from(likes)
    .innerJoin(scenes, eq(scenes.id, likes.sceneId))
    .where(eq(likes.userId, userId))

  return rows.map((row) => row.slug)
}
