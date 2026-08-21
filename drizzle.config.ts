import { readFileSync } from "node:fs"
import { defineConfig } from "drizzle-kit"

function readDatabaseUrl(): string {
  for (const name of ["COMMUNITY_DATABASE_URL", "DATABASE_URL"]) {
    const fromEnv = process.env[name]

    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv
    }
  }

  try {
    const file = readFileSync(".env.local", "utf8")

    for (const name of ["COMMUNITY_DATABASE_URL", "DATABASE_URL"]) {
      const value = file.match(new RegExp(`^${name}\\s*=\\s*(.*)$`, "m"))?.[1]

      if (value) {
        return value.trim().replace(/^["']|["']$/g, "")
      }
    }

    return ""
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
