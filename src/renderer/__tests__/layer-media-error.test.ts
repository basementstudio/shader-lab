import { beforeEach, describe, expect, test } from "bun:test"
import { createLayer } from "@/lib/editor/layers"
import {
  describeMediaLoadFailure,
  setLayerMediaError,
} from "@/renderer/layer-media-error"
import { useLayerStore } from "@/store/layer-store"

function seedImageLayer(): string {
  const layer = createLayer("image", 0)

  useLayerStore.getState().replaceState([layer], layer.id)

  return layer.id
}

function runtimeErrorOf(layerId: string): string | null {
  return (
    useLayerStore.getState().layers.find((layer) => layer.id === layerId)
      ?.runtimeError ?? null
  )
}

beforeEach(() => {
  useLayerStore.getState().replaceState([], null)
})

describe("describeMediaLoadFailure", () => {
  test("names the file so the author knows which asset broke", () => {
    expect(describeMediaLoadFailure("clip.mp4")).toBe("Couldn't load clip.mp4")
  })

  test("falls back when the reference carries no file name", () => {
    expect(describeMediaLoadFailure(undefined)).toBe("Couldn't load media")
    expect(describeMediaLoadFailure("")).toBe("Couldn't load media")
  })
})

describe("setLayerMediaError", () => {
  test("a failed media load becomes a visible error instead of silence", () => {
    const id = seedImageLayer()

    expect(runtimeErrorOf(id)).toBeNull()

    setLayerMediaError(id, describeMediaLoadFailure("birb.png"))

    expect(runtimeErrorOf(id)).toBe("Couldn't load birb.png")
  })

  test("a later success clears the error", () => {
    const id = seedImageLayer()

    setLayerMediaError(id, describeMediaLoadFailure("birb.png"))
    setLayerMediaError(id, null)

    expect(runtimeErrorOf(id)).toBeNull()
  })

  test("repeating the same message does not rewrite state", () => {
    const id = seedImageLayer()
    const message = describeMediaLoadFailure("birb.png")

    setLayerMediaError(id, message)
    const afterFirst = useLayerStore.getState().layers

    setLayerMediaError(id, message)

    expect(useLayerStore.getState().layers).toBe(afterFirst)
  })

  test("clearing an already-clear layer does not rewrite state", () => {
    const id = seedImageLayer()
    const before = useLayerStore.getState().layers

    setLayerMediaError(id, null)

    expect(useLayerStore.getState().layers).toBe(before)
  })

  test("a layer that has been deleted mid-load is ignored", () => {
    const id = seedImageLayer()

    useLayerStore.getState().replaceState([], null)

    expect(() =>
      setLayerMediaError(id, describeMediaLoadFailure("birb.png"))
    ).not.toThrow()
    expect(useLayerStore.getState().layers).toHaveLength(0)
  })

  test("only the failing layer is marked", () => {
    const a = createLayer("image", 0)
    const b = createLayer("video", 0)

    useLayerStore.getState().replaceState([a, b], a.id)

    setLayerMediaError(b.id, describeMediaLoadFailure("clip.mp4"))

    expect(runtimeErrorOf(a.id)).toBeNull()
    expect(runtimeErrorOf(b.id)).toBe("Couldn't load clip.mp4")
  })
})
