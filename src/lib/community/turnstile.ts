const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface TurnstileResult {
  errorCodes: string[]
  ok: boolean
  skipped: boolean
}

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()

  if (!secret) {
    return { errorCodes: [], ok: true, skipped: true }
  }

  if (!token) {
    return { errorCodes: ["missing-input-response"], ok: false, skipped: false }
  }

  const body = new URLSearchParams({ response: token, secret })

  if (remoteIp) {
    body.set("remoteip", remoteIp)
  }

  try {
    const response = await fetch(VERIFY_URL, { body, method: "POST" })
    const data = (await response.json()) as {
      "error-codes"?: string[]
      success?: boolean
    }

    return {
      errorCodes: data["error-codes"] ?? [],
      ok: data.success === true,
      skipped: false,
    }
  } catch {
    return { errorCodes: ["verification-unreachable"], ok: false, skipped: false }
  }
}
