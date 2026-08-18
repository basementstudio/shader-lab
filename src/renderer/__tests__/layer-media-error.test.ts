import { beforeEach, describe, expect, test } from "bun:test"
import { createLayer } from "@/lib/editor/layers"
import {
  describeCameraFailure,
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

function cameraFailure(name: string): Error {
  const error = new Error("getUserMedia rejected")

  error.name = name

  return error
}

describe("describeCameraFailure", () => {
  test("reads the DOMException getUserMedia actually rejects with", () => {
    expect(
      describeCameraFailure(new DOMException("denied", "NotAllowedError"))
    ).toBe("Camera permission denied")
    expect(
      describeCameraFailure(new DOMException("no device", "NotFoundError"))
    ).toBe("No camera found")
  })

  test("a refused permission says so, instead of blaming the media", () => {
    expect(describeCameraFailure(cameraFailure("NotAllowedError"))).toBe(
      "Camera permission denied"
    )
    expect(describeCameraFailure(cameraFailure("SecurityError"))).toBe(
      "Camera permission denied"
    )
  })

  test("a missing device reads differently from a refusal", () => {
    expect(describeCameraFailure(cameraFailure("NotFoundError"))).toBe(
      "No camera found"
    )
    expect(describeCameraFailure(cameraFailure("OverconstrainedError"))).toBe(
      "No camera found"
    )
  })

  test("an unrecognised rejection still names the camera", () => {
    expect(describeCameraFailure(cameraFailure("NotReadableError"))).toBe(
      "Couldn't start the camera"
    )
    expect(describeCameraFailure(new Error("boom"))).toBe(
      "Couldn't start the camera"
    )
    expect(describeCameraFailure(undefined)).toBe("Couldn't start the camera")
    expect(describeCameraFailure("NotAllowedError")).toBe(
      "Couldn't start the camera"
    )
  })

  test("says something better than the generic media message", () => {
    expect(describeCameraFailure(cameraFailure("NotAllowedError"))).not.toBe(
      describeMediaLoadFailure(undefined)
    )
  })
})

describe("a camera layer that keeps failing", () => {
  test("reports once and then stops rewriting state, so the sidebar settles", () => {
    const layer = createLayer("live", 0)

    useLayerStore.getState().replaceState([layer], layer.id)

    const denial = cameraFailure("NotAllowedError")

    setLayerMediaError(layer.id, describeCameraFailure(denial))

    const afterFirstReport = useLayerStore.getState().layers

    expect(runtimeErrorOf(layer.id)).toBe("Camera permission denied")

    for (let retry = 0; retry < 5; retry += 1) {
      setLayerMediaError(layer.id, describeCameraFailure(denial))
    }

    expect(useLayerStore.getState().layers).toBe(afterFirstReport)
  })

  test("clears the message once the camera finally starts", () => {
    const layer = createLayer("live", 0)

    useLayerStore.getState().replaceState([layer], layer.id)

    setLayerMediaError(
      layer.id,
      describeCameraFailure(cameraFailure("NotAllowedError"))
    )
    setLayerMediaError(layer.id, null)

    expect(runtimeErrorOf(layer.id)).toBeNull()
  })
})
