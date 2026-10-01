import type { PropsWithChildren } from "react"
import { CommunityToolbar } from "@/components/community/community-toolbar"
import { ThemeMount } from "@/components/editor/theme-mount"

export default function CommunityLayout({ children }: PropsWithChildren) {
  return (
    <>
      <ThemeMount />
      <CommunityToolbar />
      {children}
    </>
  )
}
