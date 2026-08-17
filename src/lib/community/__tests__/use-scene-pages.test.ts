import { describe, expect, test } from "bun:test"
import { sceneListKey, sceneListUrl } from "@/lib/community/use-scene-pages"

function paramsOf(url: string): URLSearchParams {
  return new URL(url, "http://localhost").searchParams
}

describe("sceneListUrl", () => {
  test("omits author when there is none", () => {
    expect(paramsOf(sceneListUrl({ sort: "popular" })).has("author")).toBe(false)
  })

  test("carries the author through", () => {
    const params = paramsOf(
      sceneListUrl({ author: "tobi-moccagatta", sort: "latest" })
    )

    expect(params.get("author")).toBe("tobi-moccagatta")
    expect(params.get("sort")).toBe("latest")
  })

  test("keeps author, cursor and query together", () => {
    const params = paramsOf(
      sceneListUrl({
        author: "tobi-moccagatta",
        cursor: "WyIyMDI2Il0",
        query: "  crt  ",
        sort: "latest",
      })
    )

    expect(params.get("author")).toBe("tobi-moccagatta")
    expect(params.get("cursor")).toBe("WyIyMDI2Il0")
    expect(params.get("q")).toBe("crt")
  })

  test("a null author is treated as absent", () => {
    expect(paramsOf(sceneListUrl({ author: null, sort: "popular" })).has("author")).toBe(
      false
    )
  })
})

describe("sceneListKey", () => {
  test("separates two authors on the same sort", () => {
    expect(sceneListKey("latest", "", "alice")).not.toBe(
      sceneListKey("latest", "", "bob")
    )
  })

  test("separates an author-scoped list from the global one", () => {
    expect(sceneListKey("latest", "", "alice")).not.toBe(
      sceneListKey("latest", "")
    )
  })

  test("treats a missing and a null author the same", () => {
    expect(sceneListKey("popular", "")).toBe(sceneListKey("popular", "", null))
  })

  test("still separates sort and query", () => {
    expect(sceneListKey("latest", "", "alice")).not.toBe(
      sceneListKey("popular", "", "alice")
    )
    expect(sceneListKey("latest", "crt", "alice")).not.toBe(
      sceneListKey("latest", "", "alice")
    )
  })
})
