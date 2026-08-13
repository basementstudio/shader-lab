"use client"

import { Popover } from "@base-ui/react/popover"
import { GitHubLogoIcon, PersonIcon } from "@radix-ui/react-icons"
import Image from "next/image"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { type SocialProvider, startSignIn } from "@/lib/auth/sign-in"
import { cn } from "@/lib/cn"

function describeSignInProblem(problem: "failed" | null): string {
  if (problem === "failed") {
    return "Could not start sign in. Try again."
  }

  return "To publish scenes and remix with credit."
}

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" height={14} viewBox="0 0 18 18" width={14}>
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function AuthMenu() {
  const { data: session, isPending } = authClient.useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<"failed" | null>(null)

  const signIn = useCallback(async (provider: SocialProvider) => {
    setBusy(provider)
    setProblem(null)

    const outcome = await startSignIn(provider)

    if (outcome) {
      setProblem(outcome)
      setBusy(null)
    }
  }, [])

  const signOut = useCallback(async () => {
    setBusy("signout")

    try {
      await authClient.signOut()
    } finally {
      setBusy(null)
    }
  }, [])

  const user = session?.user

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={user ? "Account" : "Sign in"}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-hover)] hover:bg-white/8 hover:text-[var(--ds-color-text-primary)]"
        disabled={isPending}
      >
        {user?.image ? (
          <Image
            alt=""
            className="size-[22px] rounded-full object-cover"
            height={22}
            src={user.image}
            width={22}
          />
        ) : (
          <PersonIcon height={16} width={16} />
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="z-100"
          side="bottom"
          sideOffset={16}
        >
          <Popover.Popup className="outline-none">
            <GlassPanel
              className={cn(
                "p-[var(--ds-space-2)]",
                user ? "w-[132px]" : "w-[224px] p-[var(--ds-space-3)]"
              )}
              variant="panel"
            >
              {user ? (
                <Button
                  disabled={busy !== null}
                  fullWidth
                  onClick={signOut}
                  size="compact"
                  variant="secondary"
                >
                  Sign out
                </Button>
              ) : (
                <div className="flex flex-col gap-[var(--ds-space-3)]">
                  <div className="flex flex-col gap-[2px]">
                    <Typography as="span" variant="label">
                      Sign in
                    </Typography>
                    <Typography
                      as="span"
                      tone="tertiary"
                      variant="caption"
                      className="text-balance"
                    >
                      {describeSignInProblem(problem)}
                    </Typography>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Button
                      disabled={busy !== null}
                      fullWidth
                      onClick={() => signIn("github")}
                      size="compact"
                      variant="secondary"
                    >
                      <GitHubLogoIcon height={14} width={14} />
                      {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
                    </Button>
                    <Button
                      disabled={busy !== null}
                      fullWidth
                      onClick={() => signIn("google")}
                      size="compact"
                      variant="secondary"
                    >
                      <GoogleGlyph />
                      {busy === "google" ? "Redirecting…" : "Continue with Google"}
                    </Button>
                  </div>
                </div>
              )}
            </GlassPanel>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
