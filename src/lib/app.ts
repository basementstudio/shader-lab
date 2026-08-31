export const APP_NAME = "Shader Lab"
export const APP_DEFAULT_TITLE = "Shader Lab"
export const APP_TITLE_TEMPLATE = "%s | basement.studio"
export const APP_DESCRIPTION =
  "A free browser-based WebGPU editor by basement.studio to create, stack, and animate shader effects on images, video, text, and 3D — with a remixable community gallery."

function resolveAppBaseUrl() {
  const explicitBaseUrl = process.env.NEXT_PUBLIC_BASE_URL

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "")
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL

  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl}`
  }

  const vercelPreviewUrl = process.env.VERCEL_URL

  if (vercelPreviewUrl) {
    return `https://${vercelPreviewUrl}`
  }

  return "http://localhost:3000"
}

export const APP_BASE_URL = resolveAppBaseUrl()

/**
 * Preview and development deployments must never be indexed or listed. An
 * unset VERCEL_ENV counts as production on purpose: it only occurs off-Vercel
 * (local `next start`, CI), where treating the build as production lets the
 * real robots/sitemap/metadata output be verified. Every actual Vercel
 * deployment — previews included — has VERCEL_ENV set.
 */
export function isProductionDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV

  return !vercelEnv || vercelEnv === "production"
}
