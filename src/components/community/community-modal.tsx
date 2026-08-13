"use client"

import {
  ArrowLeftIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AuthMenu } from "@/components/community/auth-menu"
import { MyScenesGrid } from "@/components/community/my-scenes-grid"
import { SceneCard } from "@/components/community/scene-card"
import { SceneDetail } from "@/components/community/scene-detail"
import { SceneEmptyState } from "@/components/community/scene-empty-state"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/cn"
import type {
  AuthoredScene,
  CommunitySceneDetail,
  CommunitySceneSummary,
  SceneSort,
} from "@/lib/community/scenes"
import { acquirePreviewRenderLock } from "@/lib/editor/preview-render-lock"
import {
  applyLabProjectFile,
  hasImportedCustomShaderCode,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const

const SORT_TABS: readonly { label: string; value: SceneSort }[] = [
  { label: "Latest", value: "latest" },
  { label: "Popular", value: "popular" },
  { label: "Featured", value: "featured" },
]

const VIEW_TABS: readonly { label: string; value: "explore" | "mine" }[] = [
  { label: "Explore", value: "explore" },
  { label: "My scenes", value: "mine" },
]

const TAB_CLASS_NAME =
  "inline-flex min-h-7 cursor-pointer items-center justify-center rounded-[var(--ds-radius-control)] border border-transparent px-[10px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]"

export function CommunityModal({
  focusSlug,
  onOpenChange,
  onRequestPublish,
  open,
}: {
  focusSlug?: string | null
  onOpenChange: (open: boolean) => void
  onRequestPublish: () => void
  open: boolean
}) {
  const reduceMotion = useReducedMotion() ?? false
  const { data: session } = authClient.useSession()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<"explore" | "mine">("explore")
  const [mine, setMine] = useState<AuthoredScene[] | null>(null)
  const [sort, setSort] = useState<SceneSort>("latest")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<CommunitySceneSummary[] | null>(null)
  const [selected, setSelected] = useState<CommunitySceneSummary | null>(null)
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

    return acquirePreviewRenderLock()
  }, [open])

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search), 220)

    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setItems(null)
    setError(null)

    const params = new URLSearchParams({ limit: "24", sort })

    if (query.trim().length > 0) {
      params.set("q", query.trim())
    }

    fetch(`/api/community/scenes?${params.toString()}`)
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
  }, [open, query, sort])

  useEffect(() => {
    if (!session?.user) {
      setTab("explore")
      setMine(null)
    }
  }, [session?.user])

  useEffect(() => {
    if (!(open && tab === "mine" && session?.user)) {
      return
    }

    let cancelled = false
    setMine(null)
    setError(null)

    fetch("/api/community/me/scenes")
      .then((res) => res.json())
      .then((data: { scenes?: AuthoredScene[] }) => {
        if (!cancelled) {
          setMine(data.scenes ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load your scenes.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, session?.user, tab])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      if (selected) {
        setSelected(null)
        setDetail(null)
        return
      }

      onOpenChange(false)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange, open, selected])

  const openScene = useCallback(async (summary: CommunitySceneSummary) => {
    setError(null)
    setSelected(summary)
    setDetail(null)

    try {
      const res = await fetch(`/api/community/scenes/${summary.slug}`)
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

  useEffect(() => {
    if (!(open && focusSlug)) {
      return
    }

    void (async () => {
      try {
        const res = await fetch(`/api/community/scenes/${focusSlug}`)
        const data = (await res.json()) as { scene?: CommunitySceneDetail }

        if (data.scene) {
          setSelected(data.scene)
          setDetail(data.scene)
        }
      } catch {
        setError("Could not open that scene.")
      }
    })()
  }, [focusSlug, open])

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
        setSelected(null)
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
                <div className="flex items-center justify-between border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                  <Typography as="h2" className="leading-5" variant="title">
                    Community
                  </Typography>
                  <div className="flex items-center gap-[var(--ds-space-2)]">
                    {session?.user ? (
                      <Button
                        onClick={onRequestPublish}
                        size="compact"
                        variant="primary"
                      >
                        Publish a scene
                      </Button>
                    ) : (
                      <Typography as="span" tone="tertiary" variant="caption">
                        Sign in to publish
                      </Typography>
                    )}
                    <AuthMenu />
                    <IconButton
                      aria-label="Close community scenes"
                      className="h-7 w-7"
                      onClick={() => onOpenChange(false)}
                      variant="default"
                    >
                      <Cross2Icon height={18} width={18} />
                    </IconButton>
                  </div>
                </div>

                <div className="flex h-[48px] shrink-0 items-center justify-between gap-[var(--ds-space-3)] overflow-hidden border-b border-[var(--ds-border-divider)] px-4">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {selected ? (
                      <Button
                        onClick={() => {
                          setSelected(null)
                          setDetail(null)
                        }}
                        size="compact"
                        variant="ghost"
                      >
                        <ArrowLeftIcon height={14} width={14} />
                        All scenes
                      </Button>
                    ) : (
                      <>
                        {session?.user ? (
                          <>
                            {VIEW_TABS.map((view) => (
                              <button
                                className={cn(
                                  TAB_CLASS_NAME,
                                  tab === view.value &&
                                    "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
                                )}
                                key={view.value}
                                onClick={() => setTab(view.value)}
                                type="button"
                              >
                                <Typography
                                  as="span"
                                  tone={
                                    tab === view.value ? "primary" : "tertiary"
                                  }
                                  variant="label"
                                >
                                  {view.label}
                                </Typography>
                              </button>
                            ))}
                            <span
                              aria-hidden="true"
                              className="mx-1 h-4 w-px shrink-0 bg-[var(--ds-border-divider)]"
                            />
                          </>
                        ) : null}

                        {tab === "explore"
                          ? SORT_TABS.map((sortTab) => (
                              <button
                                className={cn(
                                  TAB_CLASS_NAME,
                                  sort === sortTab.value &&
                                    "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)]"
                                )}
                                key={sortTab.value}
                                onClick={() => setSort(sortTab.value)}
                                type="button"
                              >
                                <Typography
                                  as="span"
                                  tone={
                                    sort === sortTab.value
                                      ? "primary"
                                      : "tertiary"
                                  }
                                  variant="label"
                                >
                                  {sortTab.label}
                                </Typography>
                              </button>
                            ))
                          : null}
                      </>
                    )}
                  </div>

                  {selected || tab === "mine" ? null : (
                    <label className="inline-flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] px-2 transition-[border-color] duration-160 ease-[var(--ease-out-cubic)] focus-within:border-[var(--ds-border-active)]">
                      <span className="text-[var(--ds-color-text-tertiary)]">
                        <MagnifyingGlassIcon height={13} width={13} />
                      </span>
                      <input
                        aria-label="Search scenes"
                        className="w-[150px] min-w-0 border-0 bg-transparent font-[var(--ds-font-sans)] text-[11px] text-[var(--ds-color-text-primary)] outline-none placeholder:text-[var(--ds-color-text-disabled)]"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search scenes"
                        type="search"
                        value={search}
                      />
                    </label>
                  )}
                </div>

                {error ? (
                  <div
                    className="border-b border-[var(--ds-border-divider)] bg-[rgb(120_28_28_/_0.22)] px-4 py-2"
                    role="alert"
                  >
                    <Typography as="p" variant="caption">
                      {error}
                    </Typography>
                  </div>
                ) : null}

                <div className="h-[min(62vh,560px)]">
                  {selected ? (
                    <SceneDetail
                      detail={detail}
                      onRemix={remix}
                      remixing={remixing}
                      scene={selected}
                    />
                  ) : null}

                  {!selected && tab === "mine" ? (
                    <div className="h-full overflow-y-auto p-4">
                      {mine === null && !error ? (
                        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
                          {SKELETON_KEYS.slice(0, 4).map((key) => (
                            <div
                              className="flex animate-pulse flex-col gap-[var(--ds-space-2)]"
                              key={key}
                            >
                              <div className="aspect-[16/10] w-full rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
                              <div className="h-[10px] w-3/5 rounded-[3px] bg-[var(--ds-color-surface-subtle)]" />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {mine?.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-[var(--ds-space-3)]">
                          <Typography
                            align="center"
                            as="p"
                            tone="tertiary"
                            variant="caption"
                          >
                            You have not published a scene yet.
                          </Typography>
                          <Button
                            onClick={onRequestPublish}
                            size="compact"
                            variant="primary"
                          >
                            Publish a scene
                          </Button>
                        </div>
                      ) : null}

                      {mine && mine.length > 0 ? (
                        <MyScenesGrid
                          onDeleted={(slug) => {
                            setMine((current) =>
                              (current ?? []).filter(
                                (entry) => entry.slug !== slug
                              )
                            )
                            setItems((current) =>
                              current
                                ? current.filter((entry) => entry.slug !== slug)
                                : current
                            )
                          }}
                          onSelect={openScene}
                          scenes={mine}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {!selected && tab === "explore" ? (
                    <div className="h-full overflow-y-auto p-4">
                      {items === null && !error ? (
                        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
                          {SKELETON_KEYS.map((key) => (
                            <div
                              className="flex animate-pulse flex-col gap-[var(--ds-space-2)]"
                              key={key}
                            >
                              <div className="aspect-[16/10] w-full rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]" />
                              <div className="flex flex-col gap-[6px] px-[2px]">
                                <div className="h-[10px] w-3/5 rounded-[3px] bg-[var(--ds-color-surface-subtle)]" />
                                <div className="flex items-center gap-1.5">
                                  <div className="size-5 shrink-0 rounded-full bg-[var(--ds-color-surface-subtle)]" />
                                  <div className="h-[9px] w-2/5 rounded-[3px] bg-[var(--ds-color-surface-subtle)]" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {items?.length === 0 ? (
                        <SceneEmptyState
                          onClearSearch={() => setSearch("")}
                          query={query}
                        />
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
                  ) : null}
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}
