import { create } from "zustand"

export type AgentBridgeStatus =
  | "connected"
  | "connecting"
  | "failed"
  | "off"

const STORAGE_KEY = "shader-lab:agent-bridge-enabled"

function readPersistedEnabled(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function persistEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return
  }

  try {
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    return
  }
}

export interface AgentBridgeStoreState {
  busy: boolean
  enabled: boolean
  status: AgentBridgeStatus
}

export interface AgentBridgeStoreActions {
  setBusy: (busy: boolean) => void
  setEnabled: (enabled: boolean) => void
  setStatus: (status: AgentBridgeStatus) => void
}

export type AgentBridgeStore = AgentBridgeStoreState & AgentBridgeStoreActions

export const useAgentBridgeStore = create<AgentBridgeStore>((set) => ({
  busy: false,
  enabled: readPersistedEnabled(),
  status: "off",

  setBusy: (busy) => {
    set({ busy })
  },

  setEnabled: (enabled) => {
    persistEnabled(enabled)
    set({ enabled })
  },

  setStatus: (status) => {
    set(status === "connected" ? { status } : { busy: false, status })
  },
}))
