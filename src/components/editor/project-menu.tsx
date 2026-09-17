"use client"

import { ChevronDownIcon } from "@radix-ui/react-icons"
import { Menu, MenuItem } from "@/components/ui/menu"
import { startProject } from "@/lib/editor/project-start"

export function ProjectMenu({ mobile = false }: { mobile?: boolean }) {
  return (
    <Menu
      align="start"
      className="w-[190px]"
      label="Project"
      side={mobile ? "top" : "bottom"}
      trigger={
        <>
          <span>Project</span>
          <ChevronDownIcon height={12} width={12} />
        </>
      }
      triggerClassName={
        mobile
          ? "min-h-11 w-full gap-2 px-3"
          : "h-7 w-auto gap-1.5 px-2 text-[12px]"
      }
    >
      <MenuItem onClick={() => startProject("blank")}>
        New blank project
      </MenuItem>
      <MenuItem onClick={() => startProject("demo")}>Open demo</MenuItem>
    </Menu>
  )
}
