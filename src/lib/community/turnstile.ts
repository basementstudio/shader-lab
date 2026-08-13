import { readEnv } from "@/lib/read-env"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface TurnstileResult {
  errorCodes: string[]
  ok: boolean
  skipped: boolean
}

export function isTurnstileEnabled(): boolean {
  return readEnv("TURNSTILE_SECRET_KEY") !== null
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const secret = readEnv("TURNSTILE_SECRET_KEY")

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
    return {
      errorCodes: ["verification-unreachable"],
      ok: false,
      skipped: false,
    }
  }
}
