import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { resolveDatabaseUrl } from "@/lib/community/env"
import * as schema from "@/lib/db/schema"

export type Database = ReturnType<typeof createDatabase>

function createDatabase(url: string) {
  return drizzle(neon(url), { schema })
}

let cached: Database | null = null

export function getDatabase(): Database {
  const url = resolveDatabaseUrl()

  if (!url) {
    throw new Error(
      "No database url. Set COMMUNITY_DATABASE_URL (preferred) or DATABASE_URL; guard callers with isCommunityEnabled()."
    )
  }

  if (!cached) {
    cached = createDatabase(url)
  }

  return cached
}
