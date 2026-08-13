import type { Metadata } from "next"
import { AuthCompleteHandoff } from "@/components/community/auth-complete-handoff"

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Signing you in",
}

export default function AuthCompletePage() {
  return <AuthCompleteHandoff />
}
