"use client"

import { useEffect } from "react"
import {
  isAgentBridgeEnabled,
  startAgentBridgeClient,
} from "@/lib/agent-bridge/client"
import { useAgentBridgeStore } from "@/store/agent-bridge-store"

export function AgentBridgeMount() {
  const enabled = useAgentBridgeStore((state) => state.enabled)
  const setEnabled = useAgentBridgeStore((state) => state.setEnabled)
  const setStatus = useAgentBridgeStore((state) => state.setStatus)

  // ?agent=1 (or the env flag) force-enables the bridge, so "open this URL"
  // onboarding from the MCP server keeps working alongside the topbar toggle.
  useEffect(() => {
    if (isAgentBridgeEnabled()) {
      setEnabled(true)
    }
  }, [setEnabled])

  useEffect(() => {
    if (!enabled) {
      setStatus("off")
      return
    }

    const stop = startAgentBridgeClient((status) => {
      setStatus(status)
    })

    return () => {
      stop()
      setStatus("off")
    }
  }, [enabled, setStatus])

  return null
}
