import { APP_BASE_URL } from "@/lib/app"
import { PRODUCT_FACTS } from "@/lib/structured-data/product-facts"

/**
 * The publisher's canonical `@id` lives on the studio's own domain so this
 * app's graph resolves to the same entity as basement.studio's structured
 * data (which anchors the full Organization node there).
 */
export const ORGANIZATION_ID = "https://basement.studio/#organization"

export function generateOrganizationSchema() {
  const { publisher } = PRODUCT_FACTS

  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: publisher.name,
    alternateName: [...publisher.alternateNames],
    url: publisher.url,
    foundingDate: publisher.foundingDate,
    sameAs: [...publisher.sameAs],
  }
}

export function generateWebSiteSchema() {
  return {
    "@type": "WebSite",
    "@id": `${APP_BASE_URL}/#website`,
    name: PRODUCT_FACTS.name,
    url: APP_BASE_URL,
    publisher: { "@id": ORGANIZATION_ID },
  }
}
