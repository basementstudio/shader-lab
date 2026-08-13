export const AUTH_POPUP_MESSAGE = "shader-lab:auth-complete"

export const AUTH_POPUP_CALLBACK = "/auth/complete"

export type SocialProvider = "github" | "google"

export type PopupSignInOutcome = "blocked" | "completed" | "failed"

const POPUP_FEATURES =
  "popup=yes,width=520,height=680,noopener=no,noreferrer=no"

async function resolveAuthorizeUrl(
  provider: SocialProvider
): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/sign-in/social", {
      body: JSON.stringify({
        callbackURL: AUTH_POPUP_CALLBACK,
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

function waitForPopup(popup: Window): Promise<void> {
  return new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      window.clearInterval(closeTimer)
      window.removeEventListener("message", onMessage)
      resolve()
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return
      }

      if (
        (event.data as { type?: unknown } | null)?.type !== AUTH_POPUP_MESSAGE
      ) {
        return
      }

      finish()
    }

    const closeTimer = window.setInterval(() => {
      if (popup.closed) {
        finish()
      }
    }, 400)

    window.addEventListener("message", onMessage)
  })
}

export function openAuthPopup(): Window | null {
  return window.open("about:blank", "shader-lab-auth", POPUP_FEATURES)
}

export async function signInWithPopup(
  provider: SocialProvider,
  popup: Window | null
): Promise<PopupSignInOutcome> {
  if (!popup) {
    return "blocked"
  }

  const url = await resolveAuthorizeUrl(provider)

  if (!url) {
    popup.close()

    return "failed"
  }

  popup.location.replace(url)
  popup.focus()

  await waitForPopup(popup)

  return "completed"
}
