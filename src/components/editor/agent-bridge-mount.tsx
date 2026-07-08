"use client"

import { useEffect } from "react"
import {
  isAgentBridgeEnabled,
  startAgentBridgeClient,
} from "@/lib/agent-bridge/client"

export function AgentBridgeMount() {
  useEffect(() => {
    if (!isAgentBridgeEnabled()) {
      return
    }

    return startAgentBridgeClient()
  }, [])

  return null
}
