"use client"

import { IconButton } from "@/components/ui/icon-button"
import { cn } from "@/lib/cn"
import { useAgentBridgeStore } from "@/store/agent-bridge-store"

function XmcpIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 26 26"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.97852 6H3.98065V7H2.97852V6ZM3.98065 23V20H4.98278V19H5.98492V18H7.98918V17H8.99131V16H9.99344V18H11.9977V19H12.9998V20H14.002V21H12.9998V22H11.9977V23H10.9956V22H9.99344V21H7.98918V22H6.98705V24H7.98918V25H5.98492V24H4.98278V23H3.98065ZM3.98065 6V4H4.98278V3H5.98492V2H9.99344V3H11.9977V4H12.9998V6H14.002V7H15.0041V8H16.0062V9H15.0041V10H20.0147V11H19.0126V12H17.0083V14H18.0105V15H19.0126V16H20.0147V18H21.0169V19H22.019V20H20.0147V21H19.0126V22H18.0105V21H17.0083V19H16.0062V17H15.0041V16H14.002V14H11.9977V13H4.98278V12H5.98492V11H6.98705V10H10.9956V9H9.99344V7H8.99131V5H7.98918V4H6.98705V5H4.98278V6H3.98065ZM9.99344 16V15H10.9956V16H9.99344ZM10.9956 15V14H11.9977V15H10.9956ZM14.002 20V19H15.0041V20H14.002ZM14.002 6V5H15.0041V6H14.002ZM15.0041 5V4H16.0062V2H18.0105V3H20.0147V2H22.019V5H21.0169V6H19.0126V7H18.0105V6H17.0083V8H16.0062V5H15.0041ZM22.019 19V18H23.0211V19H22.019ZM22.019 2V1H23.0211V2H22.019Z"
        fill="currentColor"
      />
    </svg>
  )
}

const TOOLTIP_BY_STATUS = {
  connected: "Agent connected — click to disable",
  connecting: "Agent bridge on — waiting for the MCP server",
  off: "Enable agent control (MCP)",
} as const

export function AgentBridgeToggle() {
  const enabled = useAgentBridgeStore((state) => state.enabled)
  const status = useAgentBridgeStore((state) => state.status)
  const setEnabled = useAgentBridgeStore((state) => state.setEnabled)

  return (
    <span className="relative inline-flex">
      <IconButton
        aria-label={
          enabled ? "Disable agent control" : "Enable agent control (MCP)"
        }
        aria-pressed={enabled}
        className={cn("h-7 w-7", enabled && "bg-white/10")}
        onClick={() => setEnabled(!enabled)}
        tooltip={TOOLTIP_BY_STATUS[status]}
        tooltipSide="bottom"
        uiSound="none"
        variant={enabled ? "active" : "default"}
      >
        <XmcpIcon />
      </IconButton>
      {enabled ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full border border-[var(--ds-color-canvas)]",
            status === "connected"
              ? "bg-emerald-400"
              : "animate-pulse bg-amber-400"
          )}
        />
      ) : null}
    </span>
  )
}
