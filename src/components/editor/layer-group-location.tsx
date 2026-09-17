"use client"

import { Select } from "@/components/ui/select"
import { Typography } from "@/components/ui/typography"
import { moveLayerToGroup } from "@/lib/editor/layer-groups"
import { useLayerStore } from "@/store/layer-store"

export function LayerGroupLocation({ layerId }: { layerId: string }) {
  const layers = useLayerStore((state) => state.layers)
  const moveLayer = useLayerStore((state) => state.moveLayer)
  const layer = layers.find((entry) => entry.id === layerId)
  if (!(layer && layers.some((entry) => entry.kind === "group"))) return null
  const groups = layers.filter(
    (entry) => entry.kind === "group" && entry.id !== layerId
  )
  const paths = new Map<string, string>()
  for (const group of groups)
    paths.set(
      group.id,
      `${group.parentId ? `${paths.get(group.parentId) ?? ""} / ` : ""}${group.name}`
    )
  return (
    <div className="grid items-center gap-[10px] [grid-template-columns:minmax(0,1fr)_132px]">
      <Typography tone="secondary" variant="label">
        Group
      </Typography>
      <Select
        className="w-[132px]"
        triggerClassName="w-[132px]"
        triggerAriaLabel="Move layer to group"
        onValueChange={(value) =>
          moveLayer(
            layerId,
            value === "scene" ? null : (value?.slice(6) ?? null)
          )
        }
        options={[
          { label: "Scene", value: "scene" },
          ...groups
            .filter(
              (group) => moveLayerToGroup(layers, layerId, group.id) !== null
            )
            .map((group) => ({
              label: paths.get(group.id)!,
              value: `group:${group.id}`,
            })),
        ]}
        value={layer.parentId ? `group:${layer.parentId}` : "scene"}
      />
    </div>
  )
}
