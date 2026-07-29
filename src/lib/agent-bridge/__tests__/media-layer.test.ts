import { beforeEach, describe, expect, test } from "bun:test"
import { executeAgentCommand } from "@/lib/agent-bridge/commands"
import { useLayerStore } from "@/store/layer-store"

beforeEach(() => {
  useLayerStore.getState().replaceState([], null, null, [])
})

describe("add_media_layer validation", () => {
  test("rejects unsupported extensions", async () => {
    expect(
      executeAgentCommand("add_media_layer", {
        base64: "aGVsbG8=",
        fileName: "notes.txt",
      })
    ).rejects.toThrow(/Unsupported media extension `txt`/)
  })

  test("rejects invalid base64", async () => {
    expect(
      executeAgentCommand("add_media_layer", {
        base64: "!!!not-base64!!!",
        fileName: "photo.jpg",
      })
    ).rejects.toThrow(/not valid base64/)
  })

  test("requires fileName and base64 strings", async () => {
    expect(
      executeAgentCommand("add_media_layer", { fileName: "photo.jpg" })
    ).rejects.toThrow(/`base64` must be a non-empty string/)
  })
})
