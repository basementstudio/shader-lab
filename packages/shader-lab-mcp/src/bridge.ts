import type { Server, ServerWebSocket } from "bun"

export const DEFAULT_BRIDGE_PORT = 7420
export const DEFAULT_REQUEST_TIMEOUT_MS = 5000

const ALLOWED_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export class BridgeNotConnectedError extends Error {
  constructor() {
    super(
      "No Shader Lab editor tab is connected. Open the editor in a WebGPU browser with `?agent=1` appended to the URL (e.g. http://localhost:3000/tools/shader-lab?agent=1) and try again."
    )
  }
}

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (result: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

interface BridgeResponse {
  error: string | null
  id: string
  ok: boolean
  result: unknown
}

function parseBridgeResponse(raw: unknown): BridgeResponse | null {
  if (typeof raw !== "string") {
    return null
  }

  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  if (typeof record.id !== "string" || typeof record.ok !== "boolean") {
    return null
  }

  return {
    error: typeof record.error === "string" ? record.error : null,
    id: record.id,
    ok: record.ok,
    result: record.result ?? null,
  }
}

export class EditorBridge {
  private activeSocket: ServerWebSocket<undefined> | null = null
  private pending = new Map<string, PendingRequest>()
  private requestCounter = 0
  private server: Server<undefined> | null = null

  get connected(): boolean {
    return this.activeSocket !== null
  }

  start(port: number, token: string | null): void {
    this.server = Bun.serve<undefined>({
      fetch: (request, server) => {
        const origin = request.headers.get("origin")

        if (origin !== null && !ALLOWED_ORIGIN_PATTERN.test(origin)) {
          return new Response("Forbidden origin", { status: 403 })
        }

        if (token) {
          const requestToken = new URL(request.url).searchParams.get("token")

          if (requestToken !== token) {
            return new Response("Invalid token", { status: 403 })
          }
        }

        if (server.upgrade(request)) {
          return undefined
        }

        return new Response("shader-lab-mcp bridge", { status: 200 })
      },
      hostname: "127.0.0.1",
      port,
      websocket: {
        close: (socket) => {
          if (this.activeSocket === socket) {
            this.activeSocket = null
            this.rejectAllPending(
              new Error("The editor tab disconnected mid-request.")
            )
          }
        },
        message: (_socket, message) => {
          this.handleMessage(message)
        },
        open: (socket) => {
          if (this.activeSocket && this.activeSocket !== socket) {
            this.activeSocket.close(
              4000,
              "Replaced by a newer editor connection"
            )
          }

          this.activeSocket = socket
          console.error("[shader-lab-mcp] editor tab connected")
        },
      },
    })
  }

  stop(): void {
    this.rejectAllPending(new Error("Bridge shut down."))
    this.server?.stop(true)
    this.server = null
    this.activeSocket = null
  }

  request(
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<unknown> {
    const socket = this.activeSocket

    if (!socket) {
      return Promise.reject(new BridgeNotConnectedError())
    }

    this.requestCounter += 1
    const id = `req-${this.requestCounter}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(
            `The editor did not answer \`${command}\` within ${Math.round(timeoutMs / 1000)}s. The tab may be in the background (browsers throttle hidden tabs) or the renderer may be busy.`
          )
        )
      }, timeoutMs)

      this.pending.set(id, { reject, resolve, timer })
      socket.send(JSON.stringify({ command, id, payload }))
    })
  }

  private handleMessage(message: string | Buffer): void {
    const response = parseBridgeResponse(
      typeof message === "string" ? message : message.toString("utf8")
    )

    if (!response) {
      return
    }

    const pending = this.pending.get(response.id)

    if (!pending) {
      return
    }

    this.pending.delete(response.id)
    clearTimeout(pending.timer)

    if (response.ok) {
      pending.resolve(response.result)
    } else {
      pending.reject(new Error(response.error ?? "Command failed."))
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }

    this.pending.clear()
  }
}
