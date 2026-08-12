"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { SceneCard } from "@/components/community/scene-card"
import { SceneDetail } from "@/components/community/scene-detail"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import type {
  CommunitySceneDetail,
  CommunitySceneSummary,
  SceneSort,
} from "@/lib/community/scenes"
import { applyLabProjectFile, hasImportedCustomShaderCode, parseLabProjectFile } from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"

const SKELETON_KEYS = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
] as const

const SORT_TABS: readonly { label: string; value: SceneSort }[] = [
  { label: "Latest", value: "latest" },
  { label: "Popular", value: "popular" },
  { label: "Featured", value: "featured" },
]

export function CommunityModal({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const reduceMotion = useReducedMotion() ?? false
  const [mounted, setMounted] = useState(false)
  const [sort, setSort] = useState<SceneSort>("latest")
  const [items, setItems] = useState<CommunitySceneSummary[] | null>(null)
  const [detail, setDetail] = useState<CommunitySceneDetail | null>(null)
  const [remixing, setRemixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setItems(null)
    setError(null)

    fetch(`/api/community/scenes?sort=${sort}&limit=24`)
      .then((res) => res.json())
      .then((data: { scenes?: CommunitySceneSummary[] }) => {
        if (!cancelled) {
          setItems(data.scenes ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load scenes.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, sort])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      if (detail) {
        setDetail(null)
        return
      }

      onOpenChange(false)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [detail, onOpenChange, open])

  const openScene = useCallback(async (slug: string) => {
    setError(null)

    try {
      const res = await fetch(`/api/community/scenes/${slug}`)
      const data = (await res.json()) as { scene?: CommunitySceneDetail }

      if (data.scene) {
        setDetail(data.scene)
      } else {
        setError("That scene is no longer available.")
      }
    } catch {
      setError("Could not load that scene.")
    }
  }, [])

  const remix = useCallback(
    async (scene: CommunitySceneDetail) => {
      setRemixing(true)
      setError(null)

      try {
        const res = await fetch(scene.labUrl)
        const projectFile = parseLabProjectFile(await res.text())

        if (hasImportedCustomShaderCode(projectFile)) {
          const proceed = window.confirm(
            `"${scene.title}" contains custom shader code that will compile in your browser. Continue?`
          )

          if (!proceed) {
            setRemixing(false)
            return
          }
        }

        applyLabProjectFile(projectFile, useAssetStore.getState().assets)
        onOpenChange(false)
        setDetail(null)
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not load that scene."
        )
      } finally {
        setRemixing(false)
      }
    },
    [onOpenChange]
  )

  if (!mounted) {
    return null
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-90" role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close community scenes"
            className="absolute inset-0 w-full border-0 bg-[rgb(4_5_7_/_0.56)]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            tabIndex={-1}
            transition={{
              duration: reduceMotion ? 0.12 : 0.18,
              ease: "easeOut",
            }}
            type="button"
          />

          <div className="absolute top-[76px] left-1/2 w-[min(1080px,calc(100vw-32px))] -translate-x-1/2">
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              className="w-full"
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: -10 }
              }
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.985, y: 10 }
              }
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: "easeOut" }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <GlassPanel
                aria-modal="true"
                className="max-h-[calc(100vh-112px)] overflow-hidden p-0"
                role="dialog"
                variant="panel"
              >
                {detail ? (
                  <SceneDetail
                    onBack={() => setDetail(null)}
                    onRemix={remix}
                    remixing={remixing}
                    scene={detail}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                      <Typography as="h2" className="leading-5" variant="title">
                        Community
                      </Typography>
                      <IconButton
                        aria-label="Close community scenes"
                        className="h-7 w-7"
                        onClick={() => onOpenChange(false)}
                        variant="default"
                      >
                        <Cross2Icon height={18} width={18} />
                      </IconButton>
                    </div>

                    <div className="flex gap-1.5 border-b border-[var(--ds-border-divider)] px-4 py-[10px]">
                      {SORT_TABS.map((tab) => (
                        <button
                          className={cn(
                            "inline-flex min-h-7 cursor-pointer items-center justify-center rounded-[var(--ds-radius-control)] border border-transparent px-[10px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]",
                            sort === tab.value &&
                              "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
                          )}
                          key={tab.value}
                          onClick={() => setSort(tab.value)}
                          type="button"
                        >
                          <Typography
                            as="span"
                            tone={sort === tab.value ? "primary" : "tertiary"}
                            variant="label"
                          >
                            {tab.label}
                          </Typography>
                        </button>
                      ))}
                    </div>

                    <div className="max-h-[min(62vh,560px)] overflow-y-auto p-4">
                      {error ? (
                        <Typography as="p" tone="secondary" variant="body">
                          {error}
                        </Typography>
                      ) : null}

                      {items === null && !error ? (
                        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
                          {SKELETON_KEYS.map((key) => (
                            <div
                              className="aspect-[16/10] w-full animate-pulse rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]"
                              key={key}
                            />
                          ))}
                        </div>
                      ) : null}

                      {items?.length === 0 ? (
                        <Typography as="p" tone="secondary" variant="body">
                          No published scenes yet.
                        </Typography>
                      ) : null}

                      {items && items.length > 0 ? (
                        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
                          {items.map((scene) => (
                            <SceneCard
                              key={scene.id}
                              onSelect={openScene}
                              scene={scene}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
