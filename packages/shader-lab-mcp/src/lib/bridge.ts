import { WebSocket, WebSocketServer } from "ws"

export const DEFAULT_BRIDGE_PORT = 7420
export const DEFAULT_REQUEST_TIMEOUT_MS = 5000

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

// Deployments that may always drive a local bridge: production and Vercel
// preview builds. No configuration needed — the bridge only ever binds
// loopback, so these origins can only reach a bridge on the user's own
// machine.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://eng.basement.studio",
  "https://*.vercel.app",
]

function parseExtraAllowedOrigins(): string[] {
  const fromEnv = (process.env.SHADER_LAB_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry.length > 0)

  return [...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]
}

// Localhost origins are always allowed. Additional origins (e.g. a Vercel
// preview) come from SHADER_LAB_ALLOWED_ORIGINS — comma-separated, with
// `https://*.example.com` wildcard support for preview subdomains.
export function isOriginAllowed(
  origin: string,
  extraOrigins: string[] = parseExtraAllowedOrigins()
): boolean {
  if (LOCALHOST_ORIGIN_PATTERN.test(origin)) {
    return true
  }

  return extraOrigins.some((allowed) => {
    if (!allowed.includes("*")) {
      return allowed === origin
    }

    const [scheme, rest] = allowed.split("://")

    if (!(scheme && rest && rest.startsWith("*."))) {
      return false
    }

    const suffix = rest.slice(1)

    return origin.startsWith(`${scheme}://`) && origin.endsWith(suffix)
  })
}

export class BridgeNotConnectedError extends Error {
  constructor() {
    super(
      "No Shader Lab editor tab is connected. Open the editor in a WebGPU browser with `?agent=1` appended to the URL (e.g. http://localhost:3000/tools/shader-lab?agent=1) and try again."
    )
  }
}

export class BridgeNotListeningError extends Error {
  constructor(port: number) {
    super(
      `The agent bridge could not bind ws://127.0.0.1:${port} (port in use by another process?). It retries every few seconds — free the port or set SHADER_LAB_MCP_PORT, then try again.`
    )
  }
}

const BIND_RETRY_DELAY_MS = 2000

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

class EditorBridge {
  private activeSocket: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private requestCounter = 0
  private server: WebSocketServer | null = null
  private listening = false
  private port = DEFAULT_BRIDGE_PORT

  get connected(): boolean {
    return this.activeSocket !== null
  }

  start(port: number, token: string | null): void {
    if (this.server) {
      return
    }

    this.port = port
    this.server = new WebSocketServer({ host: "127.0.0.1", port })

    this.server.on("listening", () => {
      this.listening = true
      console.error(
        `[shader-lab-mcp] bridge listening on ws://127.0.0.1:${port}`
      )
    })

    this.server.on("connection", (socket, request) => {
      const origin = request.headers.origin

      if (origin !== undefined && !isOriginAllowed(origin)) {
        console.error(
          `[shader-lab-mcp] refused connection from origin ${origin} — allow it with SHADER_LAB_ALLOWED_ORIGINS`
        )
        socket.close(4003, "Forbidden origin")
        return
      }

      if (token) {
        const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`)

        if (url.searchParams.get("token") !== token) {
          socket.close(4003, "Invalid token")
          return
        }
      }

      if (this.activeSocket && this.activeSocket !== socket) {
        this.activeSocket.close(4000, "Replaced by a newer editor connection")
      }

      this.activeSocket = socket
      console.error("[shader-lab-mcp] editor tab connected")

      socket.on("message", (data) => {
        this.handleMessage(data.toString())
      })

      socket.on("close", () => {
        if (this.activeSocket === socket) {
          this.activeSocket = null
          this.rejectAllPending(
            new Error("The editor tab disconnected mid-request.")
          )
        }
      })
    })

    this.server.on("error", (error) => {
      console.error(
        `[shader-lab-mcp] bridge server error (is port ${port} already in use?):`,
        error.message
      )

      // A failed bind (EADDRINUSE) would otherwise leave the bridge dead
      // forever while tools report "no tab connected". Tear down and retry —
      // the port often frees up moments later.
      if (!this.listening) {
        this.server?.close()
        this.server = null
        setTimeout(() => {
          this.start(port, token)
        }, BIND_RETRY_DELAY_MS)
      }
    })
  }

  request(
    command: string,
    payload: Record<string, unknown>,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<unknown> {
    const socket = this.activeSocket

    if (!this.listening) {
      return Promise.reject(new BridgeNotListeningError(this.port))
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
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

  private handleMessage(message: string): void {
    const response = parseBridgeResponse(message)

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

function resolvePort(): number {
  const raw = process.env.SHADER_LAB_MCP_PORT

  if (!raw) {
    return DEFAULT_BRIDGE_PORT
  }

  const parsed = Number.parseInt(raw, 10)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BRIDGE_PORT
}

// Singleton across all tool modules (and across dev-mode reloads): every tool
// imports this module, but only the first import starts the WS server.
const BRIDGE_KEY = Symbol.for("shader-lab-mcp.bridge")
const globalScope = globalThis as { [BRIDGE_KEY]?: EditorBridge }

export function getBridge(): EditorBridge {
  let bridge = globalScope[BRIDGE_KEY]

  if (!bridge) {
    bridge = new EditorBridge()
    const port = resolvePort()

    bridge.start(port, process.env.SHADER_LAB_AGENT_TOKEN ?? null)
    globalScope[BRIDGE_KEY] = bridge
  }

  return bridge
}

// Start eagerly at module load so the editor tab can connect before the first
// tool call.
getBridge()
