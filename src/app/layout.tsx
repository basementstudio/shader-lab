import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import { type PropsWithChildren, Suspense } from "react"
import {
  APP_BASE_URL,
  APP_DEFAULT_TITLE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_TITLE_TEMPLATE,
} from "@/lib/app"
import { cn } from "@/lib/cn"
import { fontsVariable } from "@/lib/fonts"
import "@/app/globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--geist-sans",
})

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/en-US",
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  applicationName: APP_NAME,
  authors: [{ name: "basement.studio", url: "https://basement.studio" }],
  description: APP_DESCRIPTION,
  formatDetection: { telephone: false },
  metadataBase: new URL(APP_BASE_URL),
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
    url: APP_BASE_URL,
  },
  other: {
    "fb:app_id": process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "",
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

export const viewport: Viewport = {
  colorScheme: "normal",
  themeColor: "#080808",
}

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={cn(fontsVariable, geist.variable, geist.className)}
      suppressHydrationWarning
    >
      <body>
        <Suspense fallback={null}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-9999 focus:rounded focus:bg-black focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
          >
            Skip to main content
          </a>
        </Suspense>
        {children}
      </body>
    </html>
  )
}
