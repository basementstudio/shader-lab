import { describe, expect, test } from "bun:test"
import {
  buildErrorResponse,
  buildSuccessResponse,
  parseAgentBridgeRequest,
  serializeAgentBridgeResponse,
} from "@/lib/agent-bridge/protocol"

describe("parseAgentBridgeRequest", () => {
  test("parses a valid request", () => {
    const request = parseAgentBridgeRequest(
      JSON.stringify({
        command: "get_project_state",
        id: "req-1",
        payload: { foo: 1 },
      })
    )

    expect(request).toEqual({
      command: "get_project_state",
      id: "req-1",
      payload: { foo: 1 },
    })
  })

  test("defaults a missing payload to an empty object", () => {
    const request = parseAgentBridgeRequest(
      JSON.stringify({ command: "x", id: "req-2" })
    )

    expect(request?.payload).toEqual({})
  })

  test("rejects malformed JSON", () => {
    expect(parseAgentBridgeRequest("{nope")).toBeNull()
  })

  test("rejects non-string input", () => {
    expect(parseAgentBridgeRequest(42)).toBeNull()
    expect(parseAgentBridgeRequest(new ArrayBuffer(4))).toBeNull()
  })

  test("rejects missing or empty command/id", () => {
    expect(
      parseAgentBridgeRequest(JSON.stringify({ command: "", id: "a" }))
    ).toBeNull()
    expect(
      parseAgentBridgeRequest(JSON.stringify({ command: "x", id: "" }))
    ).toBeNull()
    expect(parseAgentBridgeRequest(JSON.stringify({ id: "a" }))).toBeNull()
  })

  test("rejects array payloads", () => {
    expect(
      parseAgentBridgeRequest(
        JSON.stringify({ command: "x", id: "a", payload: [1, 2] })
      )
    ).toBeNull()
  })
})

describe("response builders", () => {
  test("success response round-trips through JSON", () => {
    const serialized = serializeAgentBridgeResponse(
      buildSuccessResponse("req-9", { layers: [] })
    )

    expect(JSON.parse(serialized)).toEqual({
      error: null,
      id: "req-9",
      ok: true,
      result: { layers: [] },
    })
  })

  test("error response carries the message", () => {
    const serialized = serializeAgentBridgeResponse(
      buildErrorResponse("req-9", "boom")
    )

    expect(JSON.parse(serialized)).toEqual({
      error: "boom",
      id: "req-9",
      ok: false,
      result: null,
    })
  })
})
