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

  useEffect(() => {
    if (isAgentBridgeEnabled()) {
      setEnabled(true)
    }
  }, [setEnabled])

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return
    }

    void import("@/lib/editor/crt-ab-harness").then((harness) => {
      harness.registerCrtAbHarness()
    })
  }, [])

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
