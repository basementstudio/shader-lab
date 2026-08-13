export const APP_NAME = "@basementstudio/shader-lab";
export const APP_DEFAULT_TITLE = "Shader Lab";
export const APP_TITLE_TEMPLATE = "%s | basement.studio";
export const APP_DESCRIPTION =
  "A powerful toolkit to create, stack, and animate shaders.";

function resolveAppBaseUrl() {
  const explicitBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (vercelProductionUrl) {
    return `https://${vercelProductionUrl}`;
  }

  const vercelPreviewUrl = process.env.VERCEL_URL;

  if (vercelPreviewUrl) {
    return `https://${vercelPreviewUrl}`;
  }

  return "http://localhost:3000";
}

export const APP_BASE_URL = resolveAppBaseUrl();
