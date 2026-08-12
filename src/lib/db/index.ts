import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "@/lib/db/schema"

export type Database = ReturnType<typeof createDatabase>

function createDatabase(url: string) {
  return drizzle(neon(url), { schema })
}

let cached: Database | null = null

export function getDatabase(): Database {
  const url = process.env.DATABASE_URL

  if (!url || url.trim().length === 0) {
    throw new Error(
      "DATABASE_URL is not set. The community feature is disabled; guard callers with isCommunityEnabled()."
    )
  }

  if (!cached) {
    cached = createDatabase(url)
  }

  return cached
}
