export const REPORT_REASONS = [
  "copyright",
  "illegal",
  "sexual",
  "spam",
  "other",
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  copyright: "Copyright",
  illegal: "Illegal",
  other: "Other",
  sexual: "Sexual",
  spam: "Spam",
}

export const MAX_REPORT_NOTE_LENGTH = 500

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  )
}
