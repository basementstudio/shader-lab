import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense, type PropsWithChildren } from "react";
import {
  APP_BASE_URL,
  APP_DEFAULT_TITLE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_TITLE_TEMPLATE,
} from "@/lib/app";
import { cn } from "@/lib/cn";
import { fontsVariable } from "@/lib/fonts";
import "@/app/globals.css";
import { Analytics } from "@vercel/analytics/next";

const geist = Geist({
  subsets: ["latin"],
  variable: "--geist-sans",
});

export const metadata: Metadata = {
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
        url: "/opengraph-image.png",
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
};

export const viewport: Viewport = {
  colorScheme: "normal",
  themeColor: "#080808",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={cn(fontsVariable, geist.variable, geist.className)}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
