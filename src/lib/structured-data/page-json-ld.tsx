import { generateOrganizationSchema } from "@/lib/structured-data/schemas/organization"

export interface SchemaNode {
  "@type": string
  [key: string]: unknown
}

interface PageJsonLdProps {
  nodes?: (SchemaNode | null)[]
}

/**
 * One `@graph` per page so `@id` references to the inlined Organization node
 * resolve. Layouts can't see their children's nodes, so every route renders it.
 *
 * `<` is escaped because scene titles and descriptions are user-generated — a
 * literal `</script>` inside a JSON string would otherwise close the tag.
 */
export function PageJsonLd({ nodes = [] }: PageJsonLdProps) {
  const graph = [generateOrganizationSchema(), ...nodes].filter(
    (node): node is SchemaNode => node !== null
  )

  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c")

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify output with `<` escaped above; no markup can survive
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
