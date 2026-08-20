import * as Sentry from "@sentry/nextjs"
import { resolveTracesSampleRate } from "@/lib/sentry-sampling"

const environment =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"

// One init for node and edge; only includeLocalVariables is runtime-specific.
export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment,
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: resolveTracesSampleRate(
      environment,
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
    ),
    ...(process.env.NEXT_RUNTIME === "nodejs"
      ? { includeLocalVariables: true }
      : {}),
  })
}

export const onRequestError = Sentry.captureRequestError
