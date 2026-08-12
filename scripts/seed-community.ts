import { mkdir, writeFile } from "node:fs/promises"
import { eq } from "drizzle-orm"
import { ensureProfile } from "@/lib/community/profile"
import { getDatabase } from "@/lib/db"
import { scenes } from "@/lib/db/schema"
import defaultProject from "@/lib/editor/default-project.json"
import { LAYER_CATALOG } from "@/lib/editor/config/layer-catalog"
import type { LayerType } from "@/types/editor"
import { neon } from "@neondatabase/serverless"

const SEED_DIR = "public/community-seed"

const DESCRIPTIONS: Record<string, string> = {
  ascii: "Terminal glyphs over a soft gradient. Tuned for legibility at small sizes.",
  "blob-tracking": "CCTV framing on moving regions, with an inner pixelation pass.",
  "chromatic-aberration": "Lens fringing pushed just past comfortable.",
  crt: "Slot-mask monitor with phosphor bloom and a slow flicker.",
  dithering: "Ordered dithering down to a four-tone palette.",
  halftone: "Print-style dot screen, rotated per channel.",
  ink: "Neon ink bleed with a fluid smear underneath.",
  pattern: "Woven texture mapped through luminance.",
  pixelation: "Hard blocks, no smoothing, deliberately lo-fi.",
  plotter: "Crosshatched pen plotter with ink pooling.",
  posterize: "Six tone steps, graphic and flat.",
  "pixel-sorting": "Luma-threshold sorting into vertical streaks.",
  slice: "Horizontal glitch bands offset on a beat.",
  threshold: "Stark black and white with a grain edge.",
  voxel: "Isometric cubes raised by brightness.",
}

async function main() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error("DATABASE_URL is required to seed.")
  }

  const sql = neon(url)
  const [author] = await sql`select id, name, email from neon_auth.user limit 1`

  if (!author) {
    throw new Error(
      "No user in neon_auth.user. Sign in once before seeding so scenes have an author."
    )
  }

  const profile = await ensureProfile(author.id, {
    email: author.email,
    name: author.name,
  })
  console.log(`author: @${profile.handle}`)

  const entries = (Object.entries(LAYER_CATALOG) as [LayerType, { label: string; previewSrc?: string }][])
    .filter(([, entry]) => Boolean(entry.previewSrc))
    .sort(([a], [b]) => a.localeCompare(b))

  await mkdir(SEED_DIR, { recursive: true })

  const db = getDatabase()
  let created = 0

  for (const [index, [layerType, entry]] of entries.entries()) {
    const key = layerType
    const slug = `${layerType}-demo`
    const label = entry.label

    const layers = [
      ...defaultProject.layers.filter((layer) => layer.type !== "crt"),
    ]

    const lab = {
      ...defaultProject,
      exportedAt: new Date(Date.UTC(2026, 6, 1 + index)).toISOString(),
      layers,
      version: 5,
    }

    const labPath = `${SEED_DIR}/${slug}.lab.json`
    await writeFile(labPath, `${JSON.stringify(lab, null, 2)}\n`)

    const existing = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.slug, slug))
      .limit(1)

    if (existing.length > 0) {
      continue
    }

    const publishedAt = new Date(Date.UTC(2026, 6, 1 + index, 12))

    await db.insert(scenes).values({
      authorId: profile.userId,
      compositionHeight: 949,
      compositionWidth: 1512,
      description: DESCRIPTIONS[key] ?? `A ${label} study.`,
      durationSeconds: 6,
      featuredAt: index % 4 === 0 ? publishedAt : null,
      hasCustomShader: false,
      id: `seed-${slug}`,
      labKey: `/community-seed/${slug}.lab.json`,
      labVersion: 5,
      layerTypes: [layerType, "gradient"],
      likeCount: (index * 37) % 340,
      publishedAt,
      remixCount: (index * 13) % 128,
      slug,
      status: "published",
      thumbnailImageId: entry.previewSrc ?? null,
      title: label,
      updatedAt: publishedAt,
    })

    created++
  }

  console.log(`seeded ${created} scenes (${entries.length} catalog entries with previews)`)
}

await main()
