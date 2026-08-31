import {
  markdownNotFoundResponse,
  markdownResponse,
} from "@/lib/aeo/md-response"
import { getPublicScene } from "@/lib/community/public-scenes"
import { scenePagePath } from "@/lib/community/scene-links"
import { buildSceneMarkdown } from "./markdown"

/**
 * Internal target for the middleware rewrite of
 * `/tools/shader-lab/community/<slug>.md` (and `Accept: text/markdown`
 * negotiation on the HTML path). Direct `/api/` access is robots-disallowed;
 * the public URL is the `.md` twin.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const scene = await getPublicScene(slug)

  if (!scene) {
    return markdownNotFoundResponse()
  }

  return markdownResponse(buildSceneMarkdown(scene), scenePagePath(scene.slug))
}
