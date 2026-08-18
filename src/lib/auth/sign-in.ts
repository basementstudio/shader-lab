import { flushAutosave } from "@/lib/editor/autosave/bus"
import { markAutosaveResume } from "@/lib/editor/autosave/resume"

export const AUTH_RETURN_TO_KEY = "shader-lab:auth-return-to"

export const AUTH_CALLBACK_PATH = "/auth/callback"

export type SocialProvider = "github" | "google"

function rememberReturnTo() {
  try {
    window.sessionStorage.setItem(
      AUTH_RETURN_TO_KEY,
      window.location.pathname + window.location.search
    )
  } catch {
    // sessionStorage can be unavailable; the default return path still works
  }
}

async function resolveAuthorizeUrl(
  provider: SocialProvider
): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/sign-in/social", {
      body: JSON.stringify({
        callbackURL: AUTH_CALLBACK_PATH,
        disableRedirect: true,
        provider,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    if (!res.ok) {
      return null
    }

    const data = (await res.json()) as { url?: unknown }

    return typeof data.url === "string" && data.url.length > 0 ? data.url : null
  } catch {
    return null
  }
}

export async function startSignIn(
  provider: SocialProvider
): Promise<"failed" | null> {
  const url = await resolveAuthorizeUrl(provider)

  if (!url) {
    return "failed"
  }

  await flushAutosave()
  rememberReturnTo()
  markAutosaveResume()

  window.location.href = url

  return null
}
