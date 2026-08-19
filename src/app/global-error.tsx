"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import "@/app/globals.css"

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    // The root layout crashed, so no error.tsx boundary ran — capture it here.
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" dir="ltr">
      <body>
        <main className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
          <section className="relative w-full max-w-2xl rounded-[28px] border border-[var(--ds-border-panel-strong)] bg-[rgb(12_12_16_/_0.72)] p-6 shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[24px] sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <p className="text-[11px] text-white/52 uppercase tracking-[0.24em]">
                Error
              </p>
              <div className="h-px flex-1 bg-[linear-gradient(90deg,rgb(255_255_255_/_0.14),transparent)]" />
            </div>

            <div className="space-y-4">
              <h1 className="max-w-xl font-semibold text-[clamp(2.5rem,7vw,4rem)] text-[var(--ds-color-text-primary)] leading-[0.9] tracking-[-0.05em]">
                Something broke.
              </h1>
              <p className="max-w-xl text-[15px] text-[var(--ds-color-text-secondary)] leading-6 sm:text-[16px]">
                The app hit an unrecoverable error and the report was sent to
                us. Reload the page to start a new session.
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-[var(--ds-radius-control)] bg-[var(--ds-color-text-primary)] px-5 py-2 text-[12px] font-medium leading-4 text-[var(--ds-color-text-on-light)] transition-[background-color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/82 active:scale-[0.98] active:bg-white/72"
              >
                Reload
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  )
}
