import { readFileSync } from "node:fs"
import { defineConfig } from "drizzle-kit"

function readDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL

  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv
  }

  try {
    const file = readFileSync(".env.local", "utf8")
    const value = file.match(/^DATABASE_URL\s*=\s*(.*)$/m)?.[1]

    return value ? value.trim().replace(/^["']|["']$/g, "") : ""
  } catch {
    return ""
  }
}

export default defineConfig({
  dbCredentials: {
    url: readDatabaseUrl(),
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  strict: true,
  verbose: true,
})
