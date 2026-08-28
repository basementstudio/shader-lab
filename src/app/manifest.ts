import type { MetadataRoute } from "next"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app"
import { EDITOR_PATH } from "@/lib/community/scene-links"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: EDITOR_PATH,
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    // Dedicated PWA icons (512px + 180px PNG) are pending brand assets; the
    // favicon keeps the manifest valid meanwhile.
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  }
}
