import { APP_BASE_URL } from "@/lib/app"

export interface CollectionItem {
  name: string
  /** Site-relative path to the item, e.g. "/tools/shader-lab/community/foo". */
  path: string
}

interface CollectionPageInput {
  /** Listing page path, e.g. "/tools/shader-lab/community". */
  path: string
  name: string
  description?: string | null
  items: CollectionItem[]
}

/**
 * Builds a schema.org `CollectionPage` whose `mainEntity` is an `ItemList` of
 * the listed scenes. Item URLs are joined to the canonical origin so every
 * entry is an absolute URL, consistent with the other schema builders.
 */
export function generateCollectionPageSchema({
  path,
  name,
  description,
  items,
}: CollectionPageInput) {
  const url = new URL(path, APP_BASE_URL).toString()
  const listed = items.filter((item) => Boolean(item.name?.trim() && item.path))

  return {
    "@type": "CollectionPage",
    "@id": `${url}#collection`,
    name,
    url,
    ...(description ? { description } : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listed.length,
      itemListElement: listed.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: new URL(item.path, APP_BASE_URL).toString(),
      })),
    },
  }
}
