import { APP_BASE_URL } from "@/lib/app"
import { EDITOR_PATH } from "@/lib/community/scene-links"
import {
  getEffectNames,
  PRODUCT_FACTS,
} from "@/lib/structured-data/product-facts"
import { ORGANIZATION_ID } from "@/lib/structured-data/schemas/organization"

export const WEB_APPLICATION_ID = `${APP_BASE_URL}${EDITOR_PATH}#app`

export function generateWebApplicationSchema() {
  return {
    "@type": "WebApplication",
    "@id": WEB_APPLICATION_ID,
    name: PRODUCT_FACTS.name,
    url: `${APP_BASE_URL}${EDITOR_PATH}`,
    description: PRODUCT_FACTS.description,
    applicationCategory: PRODUCT_FACTS.applicationCategory,
    operatingSystem: PRODUCT_FACTS.operatingSystem,
    browserRequirements: PRODUCT_FACTS.browserRequirements,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      ...PRODUCT_FACTS.capabilities,
      ...getEffectNames().map((name) => `${name} effect`),
    ],
    screenshot: `${APP_BASE_URL}/opengraph-image.jpg`,
    publisher: { "@id": ORGANIZATION_ID },
  }
}
