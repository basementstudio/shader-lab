import * as Sentry from "@sentry/nextjs"
import { resolveTracesSampleRate } from "@/lib/sentry-sampling"

const environment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development"

const ANONYMOUS_ID_KEY = "sentry-anonymous-id"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: resolveTracesSampleRate(
    environment,
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
  ),
  denyUrls: [/^(?:chrome|moz|ms-browser|safari(?:-web)?)-extension:\/\//],
  // BrowserApiErrors wraps requestAnimationFrame by default, costing on every
  // frame of the render loop. eventTarget stays on: it covers DOM and worker
  // handlers, which is most of this app.
  integrations: (defaults) => [
    ...defaults.filter(({ name }) => name !== "BrowserApiErrors"),
    Sentry.browserApiErrorsIntegration({ requestAnimationFrame: false }),
  ],
})

// Without an id every issue reports "0 users impacted". Pseudonymous, so PII
// collection stays off.
try {
  const stored = sessionStorage.getItem(ANONYMOUS_ID_KEY)
  const id = stored ?? crypto.randomUUID()

  if (!stored) {
    sessionStorage.setItem(ANONYMOUS_ID_KEY, id)
  }

  Sentry.setUser({ id })
} catch {
  // Storage throws in hardened-privacy contexts.
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
