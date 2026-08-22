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
const MIN_ACTIVITY_MS = 520

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

interface ActivityTracker {
  begin: () => void
  dispose: () => void
  end: () => void
}

function createActivityTracker(
  onChange?: (busy: boolean) => void
): ActivityTracker {
  let inFlight = 0
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    begin() {
      clear()
      inFlight += 1

      if (inFlight === 1) {
        startedAt = Date.now()
        onChange?.(true)
      }
    },
    dispose() {
      clear()
      inFlight = 0
    },
    end() {
      inFlight = Math.max(0, inFlight - 1)

      if (inFlight > 0) {
        return
      }

      const remaining = MIN_ACTIVITY_MS - (Date.now() - startedAt)

      if (remaining <= 0) {
        onChange?.(false)

        return
      }

      timer = setTimeout(() => {
        timer = null
        onChange?.(false)
      }, remaining)
    },
  }
}

async function handleBridgeMessage(
  socket: WebSocket,
  raw: unknown,
  activity: ActivityTracker
): Promise<void> {
  const request = parseAgentBridgeRequest(raw)

  if (!request) {
    return
  }

  let response: ReturnType<typeof buildSuccessResponse>

  activity.begin()

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
  } finally {
    activity.end()
  }

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(serializeAgentBridgeResponse(response))
  }
}

export type AgentBridgeConnectionStatus =
  | "connected"
  | "connecting"
  | "failed"

export interface AgentBridgeClientHandlers {
  onBusyChange?: (busy: boolean) => void
  onStatusChange?: (status: AgentBridgeConnectionStatus) => void
}

export function startAgentBridgeClient(
  handlers: AgentBridgeClientHandlers = {}
): () => void {
  const { onBusyChange, onStatusChange } = handlers
  const activity = createActivityTracker(onBusyChange)

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let unreachable = false

  const settle = (status: AgentBridgeConnectionStatus) => {
    if (!stopped) {
      onStatusChange?.(status)
    }
  }

  const connect = () => {
    if (stopped) {
      return
    }

    let opened = false

    if (!unreachable) {
      settle("connecting")
    }

    try {
      socket = new WebSocket(buildBridgeUrl())
    } catch {
      unreachable = true
      settle("failed")
      scheduleReconnect()

      return
    }

    socket.addEventListener("open", () => {
      opened = true
      unreachable = false
      settle("connected")
    })

    socket.addEventListener("message", (event) => {
      if (socket) {
        void handleBridgeMessage(socket, event.data, activity)
      }
    })

    socket.addEventListener("close", () => {
      socket = null
      activity.dispose()
      onBusyChange?.(false)
      unreachable = !opened
      settle(opened ? "connecting" : "failed")
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
    activity.dispose()

    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    socket?.close()
    socket = null
  }
}
