export const AGENT_BRIDGE_DEFAULT_PORT = 7420

export interface AgentBridgeRequest {
  command: string
  id: string
  payload: Record<string, unknown>
}

export interface AgentBridgeResponse {
  error: string | null
  id: string
  ok: boolean
  result: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseAgentBridgeRequest(
  raw: unknown
): AgentBridgeRequest | null {
  if (typeof raw !== "string") {
    return null
  }

  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(value)) {
    return null
  }

  const { command, id, payload } = value

  if (typeof command !== "string" || command.length === 0) {
    return null
  }

  if (typeof id !== "string" || id.length === 0) {
    return null
  }

  if (payload !== undefined && !isRecord(payload)) {
    return null
  }

  return {
    command,
    id,
    payload: payload ?? {},
  }
}

export function buildSuccessResponse(
  id: string,
  result: unknown
): AgentBridgeResponse {
  return {
    error: null,
    id,
    ok: true,
    result,
  }
}

export function buildErrorResponse(
  id: string,
  error: string
): AgentBridgeResponse {
  return {
    error,
    id,
    ok: false,
    result: null,
  }
}

export function serializeAgentBridgeResponse(
  response: AgentBridgeResponse
): string {
  return JSON.stringify(response)
}
