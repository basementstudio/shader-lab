import { APP_BASE_URL } from "@/lib/app"

export interface BreadcrumbItem {
  /** Human-readable label, e.g. "Community" or the scene title. */
  name: string
  /** Site-relative path, e.g. "/tools/shader-lab/community". */
  path: string
}

/**
 * Builds a schema.org `BreadcrumbList` for a nested route. Paths are joined to
 * the canonical origin so every `item` is an absolute URL, consistent with the
 * other schema builders.
 */
export function generateBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, APP_BASE_URL).toString(),
    })),
  }
}
