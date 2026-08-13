"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/cn"
import {
  MAX_REPORT_NOTE_LENGTH,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/community/report-reasons"

type Stage = "closed" | "picking" | "sent" | "failed"

export function ReportControl({ slug }: { slug: string }) {
  const { data: session } = authClient.useSession()
  const [stage, setStage] = useState<Stage>("closed")
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  if (!session?.user) {
    return (
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Sign in to report this scene
      </Typography>
    )
  }

  if (stage === "sent") {
    return (
      <Typography align="center" as="p" tone="tertiary" variant="caption">
        Reported. We will take a look.
      </Typography>
    )
  }

  const submit = async () => {
    if (!reason) {
      return
    }

    setSending(true)

    try {
      const res = await fetch(`/api/community/scenes/${slug}/report`, {
        body: JSON.stringify({ note: note.trim() || null, reason }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })

      setStage(res.ok ? "sent" : "failed")
    } catch {
      setStage("failed")
    } finally {
      setSending(false)
    }
  }

  if (stage === "closed") {
    return (
      <button
        className="cursor-pointer self-center border-0 bg-transparent p-0"
        onClick={() => setStage("picking")}
        type="button"
      >
        <Typography
          as="span"
          className="underline decoration-dotted underline-offset-2"
          tone="tertiary"
          variant="caption"
        >
          Report this scene
        </Typography>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-[var(--ds-space-2)]">
      <div className="flex flex-wrap gap-1">
        {REPORT_REASONS.map((value) => (
          <button
            className={cn(
              "inline-flex min-h-6 cursor-pointer items-center rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] px-2 leading-none transition-colors duration-160 hover:border-[var(--ds-border-hover)]",
              reason === value &&
                "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
            )}
            key={value}
            onClick={() => setReason(value)}
            type="button"
          >
            <Typography
              as="span"
              tone={reason === value ? "primary" : "tertiary"}
              variant="caption"
            >
              {REPORT_REASON_LABELS[value]}
            </Typography>
          </button>
        ))}
      </div>

      <input
        aria-label="Add a note"
        className="h-7 w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-2 font-[var(--ds-font-sans)] text-[11px] text-[var(--ds-color-text-primary)] outline-none placeholder:text-[var(--ds-color-text-disabled)] focus:border-[var(--ds-border-active)]"
        maxLength={MAX_REPORT_NOTE_LENGTH}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Anything we should know? (optional)"
        value={note}
      />

      {stage === "failed" ? (
        <Typography as="p" tone="tertiary" variant="caption">
          Could not file that report.
        </Typography>
      ) : null}

      <div className="flex gap-[var(--ds-space-2)]">
        <Button
          disabled={!reason || sending}
          onClick={() => void submit()}
          size="compact"
          variant="secondary"
        >
          {sending ? "Sending…" : "Send report"}
        </Button>
        <Button
          onClick={() => setStage("closed")}
          size="compact"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
