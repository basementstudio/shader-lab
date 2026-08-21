import { describe, expect, test } from "bun:test"
import type { CommunitySceneSummary } from "@/lib/community/scenes"
import {
  appendNextScenePage,
  sceneListKey,
  sceneListUrl,
} from "@/lib/community/use-scene-pages"

function paramsOf(url: string): URLSearchParams {
  return new URL(url, "http://localhost").searchParams
}

describe("sceneListUrl", () => {
  test("omits author when there is none", () => {
    expect(paramsOf(sceneListUrl({ sort: "popular" })).has("author")).toBe(
      false
    )
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

  test("carries a layer filter through", () => {
    const params = paramsOf(sceneListUrl({ layer: "crt", sort: "popular" }))

    expect(params.get("layer")).toBe("crt")
  })

  test("a null author is treated as absent", () => {
    expect(
      paramsOf(sceneListUrl({ author: null, sort: "popular" })).has("author")
    ).toBe(false)
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

  test("separates filtered and unfiltered lists", () => {
    expect(sceneListKey("popular", "", null, "crt")).not.toBe(
      sceneListKey("popular", "", null)
    )
  })
})

interface ScenePage {
  nextCursor: string | null
  scenes: CommunitySceneSummary[]
}

const POPULAR = sceneListKey("popular", "")
const LATEST = sceneListKey("latest", "")

function scene(slug: string): CommunitySceneSummary {
  return { slug } as CommunitySceneSummary
}

function deferredPage() {
  let resolve: (page: ScenePage) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined

  const promise = new Promise<ScenePage>((settleWith, failWith) => {
    resolve = settleWith
    reject = failWith
  })

  return { promise, reject, resolve }
}

function popularListOnScreen() {
  const cache = new Map<string, ScenePage>()

  cache.set(POPULAR, { nextCursor: "popular-2", scenes: [scene("p1")] })

  return {
    cache,
    errored: false,
    nextCursor: "popular-2" as string | null,
    scenes: [scene("p1")] as CommunitySceneSummary[] | null,
    settled: false,
    visibleKey: POPULAR,
  }
}

function appendPopularPageTwo(
  list: ReturnType<typeof popularListOnScreen>,
  fetchPage: () => Promise<ScenePage>
): Promise<void> {
  return appendNextScenePage({
    fetchPage,
    isStale: () => list.visibleKey !== POPULAR,
    key: POPULAR,
    remember: (key, page) => {
      list.cache.set(key, page)
    },
    setError: (error) => {
      list.errored = error
    },
    setNextCursor: (cursor) => {
      list.nextCursor = cursor
    },
    setScenes: (update) => {
      list.scenes = update(list.scenes)
    },
    settle: () => {
      list.settled = true
    },
  })
}

function switchToLatest(list: ReturnType<typeof popularListOnScreen>) {
  list.cache.set(LATEST, { nextCursor: "latest-2", scenes: [scene("l1")] })
  list.visibleKey = LATEST
  list.scenes = [scene("l1")]
  list.nextCursor = "latest-2"
}

describe("appendNextScenePage", () => {
  test("appends to the list it was issued for", async () => {
    const list = popularListOnScreen()
    const pending = deferredPage()
    const run = appendPopularPageTwo(list, () => pending.promise)

    pending.resolve({ nextCursor: "popular-3", scenes: [scene("p2")] })
    await run

    expect(list.scenes?.map((entry) => entry.slug)).toEqual(["p1", "p2"])
    expect(list.nextCursor).toBe("popular-3")
    expect(list.cache.get(POPULAR)).toEqual({
      nextCursor: "popular-3",
      scenes: [scene("p1"), scene("p2")],
    })
    expect(list.errored).toBe(false)
    expect(list.settled).toBe(true)
  })

  test("a page that lands after the sort changed is thrown away", async () => {
    const list = popularListOnScreen()
    const pending = deferredPage()
    const run = appendPopularPageTwo(list, () => pending.promise)

    switchToLatest(list)

    pending.resolve({ nextCursor: "popular-3", scenes: [scene("p2")] })
    await run

    expect(list.scenes?.map((entry) => entry.slug)).toEqual(["l1"])
    expect(list.nextCursor).toBe("latest-2")
    expect(list.cache.get(LATEST)).toEqual({
      nextCursor: "latest-2",
      scenes: [scene("l1")],
    })
    expect(list.cache.get(POPULAR)).toEqual({
      nextCursor: "popular-2",
      scenes: [scene("p1")],
    })
  })

  test("a discarded page still settles so pagination is not wedged", async () => {
    const list = popularListOnScreen()
    const pending = deferredPage()
    const run = appendPopularPageTwo(list, () => pending.promise)

    switchToLatest(list)

    pending.resolve({ nextCursor: "popular-3", scenes: [scene("p2")] })
    await run

    expect(list.settled).toBe(true)
  })

  test("a request that fails after the sort changed does not fault the new list", async () => {
    const list = popularListOnScreen()
    const pending = deferredPage()
    const run = appendPopularPageTwo(list, () => pending.promise)

    switchToLatest(list)

    pending.reject(new Error("Scene request failed (500)."))
    await run

    expect(list.errored).toBe(false)
    expect(list.settled).toBe(true)
  })

  test("a request that fails on the list it belongs to reports the error", async () => {
    const list = popularListOnScreen()
    const pending = deferredPage()
    const run = appendPopularPageTwo(list, () => pending.promise)

    pending.reject(new Error("Scene request failed (500)."))
    await run

    expect(list.errored).toBe(true)
    expect(list.scenes?.map((entry) => entry.slug)).toEqual(["p1"])
    expect(list.nextCursor).toBe("popular-2")
  })
})
