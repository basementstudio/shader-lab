import {
  AgentCommandError,
  executeAgentCommand,
} from "@/lib/agent-bridge/commands"
import {
  AGENT_BRIDGE_DEFAULT_PORT,
  buildErrorResponse,
  buildSuccessResponse,
  parseAgentBridgeRequest,
  serializeAgentBridgeResponse,
} from "@/lib/agent-bridge/protocol"

const RECONNECT_DELAY_MS = 3000

export function isAgentBridgeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  if (process.env.NEXT_PUBLIC_AGENT_BRIDGE === "1") {
    return true
  }

  return new URLSearchParams(window.location.search).get("agent") === "1"
}

function buildBridgeUrl(): string {
  const query = new URLSearchParams(window.location.search)
  const port = query.get("agentPort") ?? String(AGENT_BRIDGE_DEFAULT_PORT)
  const token = query.get("agentToken")
  const url = new URL(`ws://127.0.0.1:${port}/`)

  if (token) {
    url.searchParams.set("token", token)
  }

  return url.toString()
}

async function handleBridgeMessage(
  socket: WebSocket,
  raw: unknown
): Promise<void> {
  const request = parseAgentBridgeRequest(raw)

  if (!request) {
    return
  }

  let response: ReturnType<typeof buildSuccessResponse>

  try {
    const result = await executeAgentCommand(request.command, request.payload)

    response = buildSuccessResponse(request.id, result ?? null)
  } catch (error) {
    let message = "Command failed."

    if (error instanceof AgentCommandError) {
      message = error.message
    } else if (error instanceof Error) {
      message = `Unexpected error: ${error.message}`
    }

    response = buildErrorResponse(request.id, message)
  }

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(serializeAgentBridgeResponse(response))
  }
}

export type AgentBridgeConnectionStatus = "connected" | "connecting"

export function startAgentBridgeClient(
  onStatusChange?: (status: AgentBridgeConnectionStatus) => void
): () => void {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const connect = () => {
    if (stopped) {
      return
    }

    onStatusChange?.("connecting")

    try {
      socket = new WebSocket(buildBridgeUrl())
    } catch {
      scheduleReconnect()
      return
    }

    socket.addEventListener("open", () => {
      if (!stopped) {
        onStatusChange?.("connected")
      }
    })

    socket.addEventListener("message", (event) => {
      if (socket) {
        void handleBridgeMessage(socket, event.data)
      }
    })

    socket.addEventListener("close", () => {
      socket = null

      if (!stopped) {
        onStatusChange?.("connecting")
      }

      scheduleReconnect()
    })

    socket.addEventListener("error", () => {
      socket?.close()
    })
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY_MS)
  }

  connect()

  return () => {
    stopped = true

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    socket?.close()
    socket = null
  }
}
