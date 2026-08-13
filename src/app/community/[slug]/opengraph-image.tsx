import { ImageResponse } from "next/og"
import { getPublicScene } from "@/lib/community/public-scenes"

export const alt = "A Shader Lab community scene"
export const size = { height: 630, width: 1200 }
export const contentType = "image/png"

const SATORI_DECODABLE = /\.(png|jpe?g)(\?|$)/i

function titleSizeFor(title: string): number {
  if (title.length > 46) {
    return 58
  }

  if (title.length > 30) {
    return 72
  }

  return 88
}

function backdropFor(thumbnailUrl: string | null): string | null {
  return thumbnailUrl && SATORI_DECODABLE.test(thumbnailUrl)
    ? thumbnailUrl
    : null
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const scene = await getPublicScene(slug)
  const title = scene?.title ?? "Shader Lab"
  const author = scene
    ? (scene.authorName ?? `@${scene.authorHandle}`)
    : "basement.studio"
  const backdrop = backdropFor(scene?.thumbnailUrl ?? null)
  const titleSize = titleSizeFor(title)

  return new ImageResponse(
    <div
      style={{
        backgroundColor: "#080808",
        color: "#f5f5f5",
        display: "flex",
        height: size.height,
        position: "relative",
        width: size.width,
      }}
    >
      {backdrop ? (
        <img
          alt=""
          height={size.height}
          src={backdrop}
          style={{
            height: size.height,
            left: 0,
            objectFit: "cover",
            opacity: 0.6,
            position: "absolute",
            top: 0,
            width: size.width,
          }}
          width={size.width}
        />
      ) : null}

      <div
        style={{
          background:
            "linear-gradient(90deg, rgba(8,8,8,0.96) 30%, rgba(8,8,8,0.25) 100%)",
          display: "flex",
          height: size.height,
          left: 0,
          position: "absolute",
          top: 0,
          width: size.width,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          padding: 72,
          position: "relative",
          width: "100%",
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
              fontSize: titleSize,
              fontWeight: 600,
              letterSpacing: titleSize * -0.035,
              lineHeight: 0.98,
              maxWidth: 940,
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "#9b9b9b",
              display: "flex",
              fontSize: 30,
              letterSpacing: -0.5,
            }}
          >
            by {author}
          </div>
        </div>
      </div>
    </div>,
    size
  )
}
