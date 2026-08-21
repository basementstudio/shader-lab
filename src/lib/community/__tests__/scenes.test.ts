import { afterEach, describe, expect, test } from "bun:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SceneCursor } from "@/lib/community/scene-cursor"
import {
  buildEffectFilter,
  buildKeysetFilter,
  buildOrderBy,
  resolveLabUrl,
  resolveThumbnailUrl,
  SCENE_SORTS,
  type SceneSort,
} from "@/lib/community/scenes"

const saved = new Map<string, string | undefined>()

function setEnv(key: string, value: string | undefined) {
  if (!saved.has(key)) {
    saved.set(key, process.env[key])
  }

  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  saved.clear()
})

describe("resolveLabUrl", () => {
  test("passes through a root-relative path untouched", () => {
    expect(resolveLabUrl("/local/scene.lab.json")).toBe("/local/scene.lab.json")
  })

  test("passes through an absolute https url untouched", () => {
    expect(resolveLabUrl("https://cdn.test/scenes/a.json")).toBe(
      "https://cdn.test/scenes/a.json"
    )
  })

  test("builds an R2 url from a bare key when the host is set", () => {
    setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", "assets.test")

    expect(resolveLabUrl("scenes/abc/scene.lab.json")).toBe(
      "https://assets.test/scenes/abc/scene.lab.json"
    )
  })

  test("returns the bare key when no host is configured", () => {
    setEnv("NEXT_PUBLIC_R2_PUBLIC_HOST", undefined)

    expect(resolveLabUrl("scenes/abc/scene.lab.json")).toBe(
      "scenes/abc/scene.lab.json"
    )
  })
})

describe("resolveThumbnailUrl", () => {
  test("returns null when there is no thumbnail", () => {
    expect(resolveThumbnailUrl(null)).toBeNull()
  })

  test("passes through local and absolute values", () => {
    expect(resolveThumbnailUrl("/examples/voxel.webp")).toBe(
      "/examples/voxel.webp"
    )
    expect(resolveThumbnailUrl("https://cdn.test/a.webp")).toBe(
      "https://cdn.test/a.webp"
    )
  })

  test("builds a Cloudflare Images variant url including the account hash", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "imagedelivery.net")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", "HASH123")

    expect(resolveThumbnailUrl("abc123")).toBe(
      "https://imagedelivery.net/HASH123/abc123/grid"
    )
  })

  test("tolerates a host written with a scheme", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "https://imagedelivery.net/")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", "HASH123")

    expect(resolveThumbnailUrl("abc123")).toBe(
      "https://imagedelivery.net/HASH123/abc123/grid"
    )
  })

  test("returns null without the account hash, rather than a broken url", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", "imagedelivery.net")
    setEnv("NEXT_PUBLIC_CF_IMAGES_ACCOUNT_HASH", undefined)

    expect(resolveThumbnailUrl("abc123")).toBeNull()
  })

  test("returns null for a bare id when Images is not configured", () => {
    setEnv("NEXT_PUBLIC_CF_IMAGES_HOST", undefined)

    expect(resolveThumbnailUrl("abc123")).toBeNull()
  })
})

const dialect = new PgDialect()

const cursor: SceneCursor = {
  featuredAt: "2026-08-10T09:00:00.000Z",
  id: "scn_abc123",
  likeCount: 7,
  publishedAt: "2026-01-01T00:00:00.000Z",
}

function sceneColumnsIn(query: SQL): string[] {
  return [...dialect.sqlToQuery(query).sql.matchAll(/"scenes"\."(\w+)"/g)].map(
    (match) => match[1] as string
  )
}

function orderByColumns(sort: SceneSort): string[] {
  return buildOrderBy(sort).flatMap(sceneColumnsIn)
}

describe("scene keyset pagination", () => {
  for (const sort of SCENE_SORTS) {
    test(`${sort} paginates on the same tuple it orders by`, () => {
      expect(sceneColumnsIn(buildKeysetFilter(sort, cursor))).toEqual(
        orderByColumns(sort)
      )
    })

    test(`${sort} orders descending, which is what its < keyset assumes`, () => {
      for (const entry of buildOrderBy(sort)) {
        expect(dialect.sqlToQuery(entry).sql).toMatch(/ desc$/)
      }

      expect(dialect.sqlToQuery(buildKeysetFilter(sort, cursor)).sql).toContain(
        ") < ("
      )
    })
  }

  test("featured keys off featured_at, so a later-featured older scene is reachable", () => {
    expect(orderByColumns("featured")).toEqual([
      "featured_at",
      "published_at",
      "id",
    ])
    expect(dialect.sqlToQuery(buildKeysetFilter("featured", cursor))).toEqual({
      params: [
        new Date(cursor.featuredAt as string),
        new Date(cursor.publishedAt),
        cursor.id,
      ],
      sql: '("scenes"."featured_at", "scenes"."published_at", "scenes"."id") < ($1::timestamptz, $2::timestamptz, $3::text)',
      typings: ["none", "none", "none"],
    })
  })

  test("a featured cursor without a featured timestamp cannot page, so it matches nothing", () => {
    const stripped: SceneCursor = { ...cursor, featuredAt: null }

    expect(
      dialect.sqlToQuery(buildKeysetFilter("featured", stripped)).sql
    ).toBe("false")
  })

  test("popular still binds the like count as an int", () => {
    const { params, sql } = dialect.sqlToQuery(
      buildKeysetFilter("popular", cursor)
    )

    expect(sql).toContain("($1::int,")
    expect(params[0]).toBe(cursor.likeCount)
  })

  test("latest ignores the columns only the other sorts key on", () => {
    expect(orderByColumns("latest")).toEqual(["published_at", "id"])
    expect(sceneColumnsIn(buildKeysetFilter("latest", cursor))).not.toContain(
      "featured_at"
    )
  })
})

describe("scene effect filtering", () => {
  test("uses PostgreSQL array containment so the GIN index can serve it", () => {
    expect(dialect.sqlToQuery(buildEffectFilter("crt"))).toEqual({
      params: ['{"crt"}'],
      sql: '"scenes"."layer_types" @> $1',
      typings: ["none"],
    })
  })
})
