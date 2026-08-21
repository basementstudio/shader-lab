import { describe, expect, test } from "bun:test"
import {
  COMMUNITY_PATH,
  communityEffectPath,
  communityEffectsPath,
  EDITOR_PATH,
  editorSceneHref,
  profileDisplayPath,
  profilePagePath,
  scenePagePath,
} from "@/lib/community/scene-links"

describe("community paths", () => {
  test("every public page sits under the editor prefix", () => {
    expect(COMMUNITY_PATH.startsWith(EDITOR_PATH)).toBe(true)
    expect(scenePagePath("5am-tokyo-run-q1zxkc")).toBe(
      "/tools/shader-lab/community/5am-tokyo-run-q1zxkc"
    )
    expect(profilePagePath("bautista-berto")).toBe(
      "/tools/shader-lab/community/u/bautista-berto"
    )
  })

  test("the editor opens a scene from its own path", () => {
    expect(editorSceneHref("5am-tokyo-run-q1zxkc")).toBe(
      "/tools/shader-lab?scene=5am-tokyo-run-q1zxkc"
    )
  })

  test("an effect filter stays on the public community page", () => {
    expect(communityEffectPath("chromatic-aberration")).toBe(
      "/tools/shader-lab/community?effect=chromatic-aberration"
    )
  })

  test("multiple effect filters use repeatable shareable parameters", () => {
    expect(communityEffectsPath(["crt", "dithering"])).toBe(
      "/tools/shader-lab/community?effect=crt&effect=dithering"
    )
    expect(communityEffectsPath([])).toBe(COMMUNITY_PATH)
  })
})

describe("profileDisplayPath", () => {
  test("drops the editor prefix so the handle hint reads as one address", () => {
    expect(profileDisplayPath("bautista-berto")).toBe(
      "/community/u/bautista-berto"
    )
    expect(`shader-lab${profileDisplayPath("bautista-berto")}`).toBe(
      "shader-lab/community/u/bautista-berto"
    )
  })

  test("never repeats the tool name the hint already prints", () => {
    expect(profileDisplayPath("bautista-berto")).not.toContain("shader-lab")
  })
})
