import {
  getMissingCommunityCapabilities,
  isAuthConfigured,
  isCommunityEnabled,
  isDatabaseConfigured,
  isMediaConfigured,
  isTurnstileConfigured,
} from "@/lib/community/config"

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim())
}

export function GET() {
  return Response.json({
    capabilities: {
      auth: isAuthConfigured(),
      database: isDatabaseConfigured(),
      media: isMediaConfigured(),
      turnstile: isTurnstileConfigured(),
    },
    enabled: isCommunityEnabled(),
    missing: getMissingCommunityCapabilities(),
    vars: {
      CLOUDFLARE_ACCOUNT_ID: present("CLOUDFLARE_ACCOUNT_ID"),
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
