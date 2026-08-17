import { authClient } from "@/lib/auth/client"
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

export async function startSignIn(
  provider: SocialProvider
): Promise<"failed" | null> {
  await flushAutosave()
  rememberReturnTo()
  markAutosaveResume()

  try {
    const result = await authClient.signIn.social({
      callbackURL: AUTH_CALLBACK_PATH,
      provider,
    })

    return result?.error ? "failed" : null
  } catch {
    return "failed"
  }
}
