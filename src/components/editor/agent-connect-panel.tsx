"use client"

import { Popover } from "@base-ui/react/popover"
import { CheckIcon, CopyIcon, Cross2Icon } from "@radix-ui/react-icons"
import { useCallback, useEffect, useState } from "react"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  type AgentBridgeStatus,
  useAgentBridgeStore,
} from "@/store/agent-bridge-store"

const INSTALL_COMMAND =
  "claude mcp add -s user shader-lab -- npx -y @basementstudio/shader-lab-mcp"

const STATUS_COPY: Record<
  AgentBridgeStatus,
  { dot: string; label: string }
> = {
  connected: {
    dot: "bg-emerald-400",
    label: "Agent connected",
  },
  connecting: {
    dot: "animate-pulse bg-amber-400",
    label: "Waiting for your agent",
  },
  failed: {
    dot: "bg-red-400",
    label: "Could not reach your agent",
  },
  off: {
    dot: "bg-white/25",
    label: "Agent control is off",
  },
}

function SignalMark({ busy }: { busy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 flex size-1.5 items-center justify-center"
    >
      {busy ? (
        <>
          <span className="absolute size-1.5 animate-[agent-signal-ring_1.5s_var(--ease-out-cubic)_infinite] rounded-full border border-current" />
          <span className="absolute size-1.5 animate-[agent-signal-ring_1.5s_var(--ease-out-cubic)_0.5s_infinite] rounded-full border border-current" />
        </>
      ) : null}
      <span className="size-1.5 rounded-full bg-current" />
    </span>
  )
}

function FailedMark() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-0 right-0 flex size-2 items-center justify-center"
    >
      <Cross2Icon
        className="!size-[11px]"
        stroke="currentColor"
        strokeWidth={2.2}
      />
    </span>
  )
}

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

function Step({
  children,
  index,
  title,
}: {
  children?: React.ReactNode
  index: number
  title: string
}) {
  return (
    <div className="flex gap-[var(--ds-space-2)]">
      <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Typography as="span" tone="secondary" variant="monoXs">
          {index}
        </Typography>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Typography as="p" tone="secondary" variant="caption">
          {title}
        </Typography>
        {children}
      </div>
    </div>
  )
}

function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }

    const timer = setTimeout(() => setCopied(false), 1600)

    return () => clearTimeout(timer)
  }, [copied])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [command])

  return (
    <button
      aria-label={copied ? "Copied" : `Copy: ${command}`}
      className="group flex w-full items-start gap-2 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-subtle)] py-1.5 pr-1.5 pl-2 text-left transition-colors duration-160 hover:border-[var(--ds-border-hover)]"
      onClick={copy}
      type="button"
    >
      <Typography
        as="code"
        className="min-w-0 flex-1 whitespace-pre-wrap break-normal leading-[1.5]"
        tone="secondary"
        variant="monoXs"
      >
        {command}
      </Typography>
      <span
        className={cn(
          "shrink-0 transition-colors duration-160",
          copied
            ? "text-emerald-400"
            : "text-[var(--ds-color-text-tertiary)] group-hover:text-[var(--ds-color-text-primary)]"
        )}
      >
        {copied ? (
          <CheckIcon height={13} width={13} />
        ) : (
          <CopyIcon height={13} width={13} />
        )}
      </span>
    </button>
  )
}

export function AgentConnectPanel() {
  const busy = useAgentBridgeStore((state) => state.busy)
  const enabled = useAgentBridgeStore((state) => state.enabled)
  const status = useAgentBridgeStore((state) => state.status)
  const setEnabled = useAgentBridgeStore((state) => state.setEnabled)

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open && !enabled) {
        setEnabled(true)
      }
    },
    [enabled, setEnabled]
  )

  const copyState = STATUS_COPY[status]
  const live = status === "connected"

  return (
    <Popover.Root onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <IconButton
            aria-label={`Connect an agent (MCP) — ${copyState.label}`}
            className="relative"
            tooltip={copyState.label}
            tooltipSide="bottom"
            variant={live ? "ghost" : "default"}
          >
            <XmcpIcon />
            {live ? <SignalMark busy={busy} /> : null}
            {status === "failed" ? <FailedMark /> : null}
          </IconButton>
        }
      />

      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="z-100"
          side="bottom"
          sideOffset={16}
        >
          <Popover.Popup className="outline-none">
            <GlassPanel className="w-[352px] p-0" variant="panel">
              <div className="flex items-center gap-[var(--ds-space-2)] border-b border-[var(--ds-border-divider)] px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    copyState.dot
                  )}
                />
                <Typography as="span" variant="label">
                  {copyState.label}
                </Typography>
              </div>

              <div className="flex flex-col gap-[var(--ds-space-3)] px-3 py-3">
                {status === "connected" ? (
                  <Typography as="p" tone="tertiary" variant="caption">
                    Ask Claude to add a layer, tweak a parameter, or write a
                    custom shader. Everything it does lands in your undo
                    history.
                  </Typography>
                ) : (
                  <>
                    <Step index={1} title="Run this once in a terminal">
                      <CommandBox command={INSTALL_COMMAND} />
                    </Step>

                    <Step index={2} title="Start Claude in any folder">
                      <CommandBox command="claude" />
                    </Step>

                    <Step
                      index={3}
                      title="Keep this tab open, then ask it to change something"
                    />
                  </>
                )}

                {enabled ? (
                  <div className="flex justify-end border-t border-[var(--ds-border-divider)] pt-2.5">
                    <button
                      className="cursor-pointer text-[var(--ds-color-text-tertiary)] transition-colors duration-160 hover:text-[var(--ds-color-text-primary)]"
                      onClick={() => setEnabled(false)}
                      type="button"
                    >
                      <Typography as="span" tone="tertiary" variant="caption">
                        Turn off
                      </Typography>
                    </button>
                  </div>
                ) : null}
              </div>
            </GlassPanel>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
