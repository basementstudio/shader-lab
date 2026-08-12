import {
  getMissingCommunityCapabilities,
  isAuthConfigured,
  isCommunityEnabled,
  isDatabaseConfigured,
  isMediaConfigured,
  isTurnstileConfigured,
} from "@/lib/community/config"
import {
  AUTH_BASE_URL_VARS,
  DATABASE_URL_VARS,
  resolveAuthBaseUrl,
  resolveDatabaseUrl,
  resolvedVarName,
} from "@/lib/community/env"

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

function hostOf(value: string | undefined): string | null {
  const raw = value?.trim()

  if (!raw) {
    return null
  }

  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({
    capabilities: {
      auth: isAuthConfigured(),
      database: isDatabaseConfigured(),
      media: isMediaConfigured(),
      turnstile: isTurnstileConfigured(),
    },
    enabled: isCommunityEnabled(),
    endpoints: {
      authHost: hostOf(resolveAuthBaseUrl() ?? undefined),
      authVar: resolvedVarName(AUTH_BASE_URL_VARS),
      databaseHost: hostOf(resolveDatabaseUrl() ?? undefined),
      databaseVar: resolvedVarName(DATABASE_URL_VARS),
    },
    missing: getMissingCommunityCapabilities(),
    vars: {
      CLOUDFLARE_ACCOUNT_ID: present("CLOUDFLARE_ACCOUNT_ID"),
      COMMUNITY_DATABASE_URL: present("COMMUNITY_DATABASE_URL"),
      COMMUNITY_NEON_AUTH_BASE_URL: present("COMMUNITY_NEON_AUTH_BASE_URL"),
      DATABASE_URL: present("DATABASE_URL"),
      NEON_AUTH_BASE_URL: present("NEON_AUTH_BASE_URL"),
      NEON_AUTH_COOKIE_SECRET: present("NEON_AUTH_COOKIE_SECRET"),
      NEXT_PUBLIC_R2_PUBLIC_HOST: present("NEXT_PUBLIC_R2_PUBLIC_HOST"),
      R2_ACCESS_KEY_ID: present("R2_ACCESS_KEY_ID"),
      R2_BUCKET: present("R2_BUCKET"),
      R2_SECRET_ACCESS_KEY: present("R2_SECRET_ACCESS_KEY"),
    },
  })
}
