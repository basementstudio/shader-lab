import type { Metadata } from "next"
import { ShaderLabPage } from "@/components/pages/shader-lab-page"
import { APP_BASE_URL } from "@/lib/app"
import { isCommunityEnabled } from "@/lib/community/config"
import { EDITOR_PATH } from "@/lib/community/scene-links"
import { PageJsonLd } from "@/lib/structured-data/page-json-ld"
import { generateWebSiteSchema } from "@/lib/structured-data/schemas/organization"
import { generateWebApplicationSchema } from "@/lib/structured-data/schemas/web-application"

const DESCRIPTION =
  "Create, stack, and animate shader effects on images, video, text, and 3D models — free, in your browser, powered by WebGPU. Export video, publish to the community gallery, and remix any published scene."

export const metadata: Metadata = {
  alternates: {
    canonical: EDITOR_PATH,
  },
  description: DESCRIPTION,
  openGraph: {
    description: DESCRIPTION,
    type: "website",
    url: `${APP_BASE_URL}${EDITOR_PATH}`,
  },
  twitter: {
    card: "summary_large_image",
    description: DESCRIPTION,
  },
}

export default function ShaderLabRoute() {
  return (
    <>
      <PageJsonLd
        nodes={[generateWebSiteSchema(), generateWebApplicationSchema()]}
      />
      <ShaderLabPage communityEnabled={isCommunityEnabled()} />
    </>
  )
}
