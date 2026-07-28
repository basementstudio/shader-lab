import { create } from "zustand"

export type AgentBridgeStatus = "connected" | "connecting" | "off"

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
  enabled: boolean
  status: AgentBridgeStatus
}

export interface AgentBridgeStoreActions {
  setEnabled: (enabled: boolean) => void
  setStatus: (status: AgentBridgeStatus) => void
}

export type AgentBridgeStore = AgentBridgeStoreState & AgentBridgeStoreActions

export const useAgentBridgeStore = create<AgentBridgeStore>((set) => ({
  enabled: readPersistedEnabled(),
  status: "off",

  setEnabled: (enabled) => {
    persistEnabled(enabled)
    set({ enabled })
  },

  setStatus: (status) => {
    set({ status })
  },
}))
