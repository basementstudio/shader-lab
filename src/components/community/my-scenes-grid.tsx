"use client"

import { SceneCard } from "@/components/community/scene-card"
import { Typography } from "@/components/ui/typography"
import type {
  AuthoredScene,
  CommunitySceneSummary,
} from "@/lib/community/scenes"

export function MyScenesGrid({
  onRemix,
  onSelect,
  scenes,
}: {
  onRemix?: (scene: CommunitySceneSummary) => void
  onSelect: (scene: CommunitySceneSummary) => void
  scenes: AuthoredScene[]
}) {
  return (
    <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
      {scenes.map((scene) => (
        <div className="relative" key={scene.slug}>
          <SceneCard onRemix={onRemix} onSelect={onSelect} scene={scene} />

          {scene.status === "published" ? null : (
            <div className="pointer-events-none absolute top-1.5 left-1.5 rounded-[var(--ds-radius-control)] border border-white/10 bg-[rgb(8_9_12_/_0.68)] px-1.5 py-[3px] backdrop-blur-[8px]">
              <Typography as="span" tone="secondary" variant="monoXs">
                {scene.status}
              </Typography>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
