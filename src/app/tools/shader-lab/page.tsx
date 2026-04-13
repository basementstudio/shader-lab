import type { Metadata } from "next"
import { ShaderLabPage } from "@/components/pages/shader-lab-page"
import {
  APP_BASE_URL,
  APP_DEFAULT_TITLE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_TITLE_TEMPLATE,
} from "@/lib/app"

const shaderLabPath = "/tools/shader-lab"

export const metadata: Metadata = {
  alternates: {
    canonical: shaderLabPath,
  },
  openGraph: {
    description: APP_DESCRIPTION,
    images: [
      {
        alt: APP_DEFAULT_TITLE,
        height: 630,
        url: "/opengraph-image.jpg",
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
    type: "website",
    url: `${APP_BASE_URL}${shaderLabPath}`,
  },
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  twitter: {
    card: "summary_large_image",
    description: APP_DESCRIPTION,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE,
    },
  },
}

export default function ShaderLabRoute() {
  return <ShaderLabPage />
}
