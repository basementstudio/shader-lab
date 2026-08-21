import { ImageResponse } from "next/og"
import { isLookupableHandle } from "@/lib/community/handle"
import { getPublicProfile } from "@/lib/community/public-profiles"

export const alt = "A Shader Lab community profile"
export const size = { height: 630, width: 1200 }
export const contentType = "image/png"

function nameSizeFor(name: string): number {
  if (name.length > 46) {
    return 58
  }

  if (name.length > 30) {
    return 72
  }

  return 88
}

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const handle = (await params).handle.toLowerCase()
  const profile = isLookupableHandle(handle)
    ? await getPublicProfile(handle)
    : null
  const name = profile?.displayName ?? `@${handle}`
  const nameSize = nameSizeFor(name)
  const count = profile?.publishedCount ?? 0
  const summary = profile
    ? `${count} ${count === 1 ? "scene" : "scenes"} on Shader Lab`
    : "Shader Lab"

  return new ImageResponse(
    <div
      style={{
        backgroundColor: "#080808",
        color: "#f5f5f5",
        display: "flex",
        flexDirection: "column",
        height: size.height,
        justifyContent: "space-between",
        padding: 72,
        width: size.width,
      }}
    >
      <div
        style={{
          color: "#e5e5e5",
          display: "flex",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: 1.6,
        }}
      >
        SHADER LAB
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            fontSize: nameSize,
            fontWeight: 600,
            letterSpacing: nameSize * -0.035,
            lineHeight: 0.98,
            maxWidth: 940,
          }}
        >
          {name}
        </div>
        <div
          style={{
            color: "#9b9b9b",
            display: "flex",
            fontSize: 30,
            letterSpacing: -0.5,
          }}
        >
          {profile ? `@${profile.handle} · ${summary}` : summary}
        </div>
      </div>
    </div>,
    size
  )
}
