"use client"

import { useEffect } from "react"
import { isAgentBridgeEnabled } from "@/lib/agent-bridge/enabled"
import { useAgentBridgeStore } from "@/store/agent-bridge-store"

export function AgentBridgeMount() {
  const enabled = useAgentBridgeStore((state) => state.enabled)
  const setBusy = useAgentBridgeStore((state) => state.setBusy)
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

    /* The bridge client pulls the renderer + export graph; only load it
     * for the opt-in agent sessions that actually connect. */
    let cancelled = false
    let stop: (() => void) | null = null

    void import("@/lib/agent-bridge/client").then((mod) => {
      if (cancelled) {
        return
      }

      stop = mod.startAgentBridgeClient({
        onBusyChange: setBusy,
        onStatusChange: setStatus,
      })
    })

    return () => {
      cancelled = true
      stop?.()
      setStatus("off")
    }
  }, [enabled, setBusy, setStatus])

  return null
}
