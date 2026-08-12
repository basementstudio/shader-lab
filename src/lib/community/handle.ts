export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 30

const RESERVED_HANDLES = new Set([
  "about",
  "admin",
  "api",
  "auth",
  "community",
  "docs",
  "edit",
  "explore",
  "featured",
  "feed",
  "help",
  "latest",
  "login",
  "logout",
  "me",
  "new",
  "popular",
  "privacy",
  "remix",
  "root",
  "scene",
  "scenes",
  "search",
  "settings",
  "shader-lab",
  "signin",
  "signout",
  "signup",
  "support",
  "terms",
  "tools",
  "user",
  "users",
])

export function slugifyHandle(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/-+$/g, "")
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle)
}

export function isValidHandle(handle: string): boolean {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH ||
    isReservedHandle(handle)
  ) {
    return false
  }

  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(handle)
}

function emailLocalPart(email: string | null | undefined): string {
  if (!email) {
    return ""
  }

  return slugifyHandle(email.split("@")[0] ?? "")
}

export function deriveHandleSeed(input: {
  email?: string | null
  name?: string | null
}): string {
  const fromName = slugifyHandle(input.name ?? "")

  if (fromName.length >= HANDLE_MIN_LENGTH) {
    return fromName
  }

  const fromEmail = emailLocalPart(input.email)

  if (fromEmail.length >= HANDLE_MIN_LENGTH) {
    return fromEmail
  }

  return "maker"
}

function withSuffix(seed: string, suffix: string): string {
  const room = HANDLE_MAX_LENGTH - suffix.length - 1
  const base = seed.slice(0, Math.max(1, room)).replace(/-+$/g, "")

  return `${base}-${suffix}`
}

export function buildHandleCandidates(
  input: { email?: string | null; name?: string | null },
  attempts = 8
): string[] {
  const seed = deriveHandleSeed(input)
  const candidates: string[] = []
  const push = (value: string) => {
    if (isValidHandle(value) && !candidates.includes(value)) {
      candidates.push(value)
    }
  }

  push(seed)

  for (let index = 2; candidates.length < attempts; index++) {
    push(withSuffix(seed, String(index)))

    if (index > attempts * 3) {
      break
    }
  }

  return candidates
}
