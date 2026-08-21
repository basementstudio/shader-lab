"use client"

import {
  ArrowLeftIcon,
  Cross2Icon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AuthMenu } from "@/components/community/auth-menu"
import { DraftsGrid } from "@/components/community/drafts-grid"
import { EmptyState } from "@/components/community/empty-state"
import { MyScenesGrid } from "@/components/community/my-scenes-grid"
import { ProfilePanel } from "@/components/community/profile-panel"
import { SceneCard } from "@/components/community/scene-card"
import { SceneDetail } from "@/components/community/scene-detail"
import { SceneEmptyState } from "@/components/community/scene-empty-state"
import { isFeaturedIndex } from "@/components/community/scene-grid"
import { SceneLoadMore } from "@/components/community/scene-load-more"
import { ShaderConsentDialog } from "@/components/community/shader-consent-dialog"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { HoverTooltip } from "@/components/ui/tooltip"
import { Typography } from "@/components/ui/typography"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/cn"
import type {
  AuthoredScene,
  DraftSummary,
  CommunitySceneDetail,
  CommunitySceneSummary,
  SceneSort,
} from "@/lib/community/scenes"
import { scenePagePath } from "@/lib/community/scene-links"
import { MAX_DRAFTS_PER_AUTHOR } from "@/lib/community/upload-limits"
import { useScenePages } from "@/lib/community/use-scene-pages"
import { requestAutosave } from "@/lib/editor/autosave/bus"
import { withAutosaveSuppressed } from "@/lib/editor/autosave/suppress"
import { acquirePreviewRenderLock } from "@/lib/editor/preview-render-lock"
import {
  applyLabProjectFile,
  hasImportedCustomShaderCode,
  parseLabProjectFile,
} from "@/lib/editor/project-file"
import { useAssetStore } from "@/store/asset-store"
import { useDraftStore } from "@/store/draft-store"
import { useEditorStore } from "@/store/editor-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const

const DRAFT_SAVE_HINT =
  "\u2318S updates the draft you have open. \u2318\u21e7S saves the current scene as a new one. Opening a draft makes it the one \u2318S writes to."

const SORT_TABS: readonly { label: string; value: SceneSort }[] = [
  { label: "Popular", value: "popular" },
  { label: "Latest", value: "latest" },
]

const VIEW_TABS: readonly {
  label: string
  value: "drafts" | "explore" | "likes" | "mine"
}[] = [
  { label: "Explore", value: "explore" },
  { label: "My scenes", value: "mine" },
  { label: "Drafts", value: "drafts" },
  { label: "Likes", value: "likes" },
]

const TAB_CLASS_NAME =
  "inline-flex min-h-7 cursor-pointer items-center justify-center rounded-[var(--ds-radius-control)] border border-transparent px-[10px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)] hover:border-[var(--ds-border-subtle)] hover:bg-[var(--ds-color-surface-subtle)]"

function PublishedGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={28}
      viewBox="0 0 32 32"
      width={28}
    >
      <rect
        height={19}
        rx={2.5}
        stroke="currentColor"
        strokeWidth={1.5}
        width={25}
        x={3.5}
        y={6.5}
      />
      <path
        d="M16 20v-8m0 0-3.5 3.5M16 12l3.5 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  )
}

function LikesGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={28}
      viewBox="0 0 32 32"
      width={28}
    >
      <path
        d="M16 25.5S5.5 19.4 5.5 13.2A5.7 5.7 0 0 1 16 10a5.7 5.7 0 0 1 10.5 3.2c0 6.2-10.5 12.3-10.5 12.3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </svg>
  )
}

function DraftsGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={28}
      viewBox="0 0 32 32"
      width={28}
    >
      <path
        d="M10 7.5h12.5a3 3 0 0 1 3 3V23"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <rect
        height={17}
        rx={2.5}
        stroke="currentColor"
        strokeWidth={1.5}
        width={19}
        x={4.5}
        y={11.5}
      />
      <path
        d="M8.5 17.5h9M8.5 22h5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  )
}

function DraftSaveHint() {
  return (
    <HoverTooltip content={DRAFT_SAVE_HINT} side="bottom">
      <button
        aria-label="How saving drafts works"
        className="inline-flex cursor-help items-center bg-transparent p-0 text-[var(--ds-color-text-muted)] transition-colors duration-160 hover:text-[var(--ds-color-text-secondary)]"
        type="button"
      >
        <InfoCircledIcon height={13} width={13} />
      </button>
    </HoverTooltip>
  )
}

export function CommunityModal({
  autoOpenSlug,
  focusSlug,
  onOpenChange,
  onRequestPublish,
  open,
}: {
  autoOpenSlug?: string | null
  focusSlug?: string | null
  onOpenChange: (open: boolean) => void
  onRequestPublish: () => void
  open: boolean
}) {
  const reduceMotion = useReducedMotion() ?? false
  const { data: session } = authClient.useSession()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<"drafts" | "explore" | "likes" | "mine">(
    "explore"
  )
  const [mine, setMine] = useState<AuthoredScene[] | null>(null)
  const [mineFailed, setMineFailed] = useState(false)
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)
  const [draftsFailed, setDraftsFailed] = useState(false)
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null)
  const [likedScenes, setLikedScenes] = useState<
    CommunitySceneSummary[] | null
  >(null)
  const [likedScenesFailed, setLikedScenesFailed] = useState(false)
  const [liked, setLiked] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SceneSort>("popular")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const explore = useScenePages({
    enabled: open && tab === "explore",
    query,
    sort,
  })
  const items = explore.scenes
  const [selected, setSelected] = useState<CommunitySceneSummary | null>(null)
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [detail, setDetail] = useState<CommunitySceneDetail | null>(null)
  const [remixing, setRemixing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consentTitle, setConsentTitle] = useState<string | null>(null)
  const consentResolver = useRef<((granted: boolean) => void) | null>(null)
  const autoOpened = useRef(false)

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

  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (userId) {
      return
    }

    setTab("explore")
    setMine(null)
    setDrafts(null)
    setLikedScenes(null)
    setLiked(new Set())
  }, [userId])

  useEffect(() => {
    if (open) {
      return
    }

    setSelectedHandle(null)
    setSelected(null)
    setDetail(null)
  }, [open])

  const backToProfileLabel = selectedHandle ? `@${selectedHandle}` : "All scenes"

  const openProfile = useCallback((handle: string) => {
    setSelected(null)
    setDetail(null)
    setSelectedHandle(handle)
  }, [])

  useEffect(() => {
    if (!(open && userId)) {
      return
    }

    let cancelled = false

    fetch("/api/community/me/likes")
      .then((res) => res.json())
      .then((data: { slugs?: string[] }) => {
        if (!cancelled) {
          setLiked(new Set(data.slugs ?? []))
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    if (!(open && userId)) {
      return
    }

    let cancelled = false

    setMineFailed(false)

    fetch("/api/community/me/scenes")
      .then((res) => res.json())
      .then((data: { scenes?: AuthoredScene[] }) => {
        if (!cancelled) {
          setMine(data.scenes ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMine([])
          setMineFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, userId])

  const loadDrafts = useCallback(() => {
    setDraftsFailed(false)

    return fetch("/api/community/me/drafts")
      .then((res) => res.json() as Promise<{ drafts?: DraftSummary[] }>)
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => {
        setDrafts([])
        setDraftsFailed(true)
      })
  }, [])

  useEffect(() => {
    if (!(open && userId && tab === "drafts")) {
      return
    }

    void loadDrafts()
  }, [loadDrafts, open, tab, userId])

  useEffect(() => {
    if (!(open && userId && tab === "likes")) {
      return
    }

    let cancelled = false

    setLikedScenesFailed(false)

    fetch("/api/community/me/likes/scenes")
      .then((res) => res.json() as Promise<{ scenes?: CommunitySceneSummary[] }>)
      .then((data) => {
        if (!cancelled) {
          setLikedScenes(data.scenes ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLikedScenes([])
          setLikedScenesFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, tab, userId])

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

  const openSceneBySlug = useCallback(async (slug: string) => {
    setError(null)

    try {
      const res = await fetch(`/api/community/scenes/${slug}`)
      const data = (await res.json()) as { scene?: CommunitySceneDetail }

      if (data.scene) {
        setSelected(data.scene)
        setDetail(data.scene)
        return
      }

      setError("That scene is no longer available.")
    } catch {
      setError("Could not load that scene.")
    }
  }, [])

  useEffect(() => {
    if (!(open && focusSlug)) {
      return
    }

    void openSceneBySlug(focusSlug)
  }, [focusSlug, open, openSceneBySlug])

  const requestShaderConsent = useCallback(
    (title: string) =>
      new Promise<boolean>((resolve) => {
        consentResolver.current = resolve
        setConsentTitle(title)
      }),
    []
  )

  const settleShaderConsent = useCallback((granted: boolean) => {
    const resolve = consentResolver.current

    consentResolver.current = null
    setConsentTitle(null)
    resolve?.(granted)
  }, [])

  const openDraft = useCallback(
    async (draft: DraftSummary) => {
      setBusyDraftId(draft.id)
      setError(null)

      try {
        const res = await fetch(draft.labUrl)

        if (!res.ok) {
          throw new Error("Could not load that draft.")
        }

        const projectFile = parseLabProjectFile(await res.text())

        withAutosaveSuppressed(() => {
          applyLabProjectFile(projectFile, useAssetStore.getState().assets)

          if (draft.forkedFrom) {
            useRemixOriginStore.getState().setRemixOrigin({
              slug: draft.forkedFrom.slug,
              title: draft.forkedFrom.title,
            })
          } else {
            useRemixOriginStore.getState().clearRemixOrigin()
          }

          useDraftStore.getState().setActiveDraft({
            id: draft.id,
            savedAt: draft.updatedAt,
            title: draft.title,
          })
        })

        requestAutosave()
        onOpenChange(false)
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not load that draft."
        )
      } finally {
        setBusyDraftId(null)
      }
    },
    [onOpenChange]
  )

  const publishDraft = useCallback(
    async (draft: DraftSummary) => {
      await openDraft(draft)

      if (useDraftStore.getState().activeDraft?.id === draft.id) {
        onRequestPublish()
      }
    },
    [onRequestPublish, openDraft]
  )

  const saveAsNewDraft = useCallback(async () => {
    setBusyDraftId("new")
    setError(null)

    try {
      const { saveDraft } = await import("@/lib/community/publish-client")

      await saveDraft({ asNewDraft: true })
      await loadDrafts()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save a new draft."
      )
    } finally {
      setBusyDraftId(null)
    }
  }, [loadDrafts])

  const deleteDraft = useCallback(
    async (draft: DraftSummary) => {
      setBusyDraftId(draft.id)
      setError(null)

      try {
        const res = await fetch(`/api/community/scenes/${draft.id}`, {
          method: "DELETE",
        })

        if (!res.ok) {
          throw new Error("Could not delete that draft.")
        }

        if (useDraftStore.getState().activeDraft?.id === draft.id) {
          useDraftStore.getState().clearActiveDraft()
        }

        setDrafts((current) =>
          (current ?? []).filter((entry) => entry.id !== draft.id)
        )
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not delete that draft."
        )
      } finally {
        setBusyDraftId(null)
      }
    },
    []
  )

  const remix = useCallback(
    async (scene: CommunitySceneDetail, options?: { auto?: boolean }) => {
      setRemixing(true)
      setError(null)

      try {
        const res = await fetch(scene.labUrl)

        if (!res.ok) {
          throw new Error("Could not load that scene.")
        }

        const projectFile = parseLabProjectFile(await res.text())

        if (hasImportedCustomShaderCode(projectFile)) {
          const granted = await requestShaderConsent(scene.title)

          if (!granted) {
            if (options?.auto) {
              window.location.replace(scenePagePath(scene.slug))
            }

            return
          }
        }

        withAutosaveSuppressed(() => {
          applyLabProjectFile(projectFile, useAssetStore.getState().assets)
          useRemixOriginStore.getState().setRemixOrigin({
            slug: scene.slug,
            title: scene.title,
          })
          useDraftStore.getState().clearActiveDraft()
        })

        requestAutosave()

        void fetch(`/api/community/scenes/${scene.slug}/remix`, {
          method: "POST",
        }).catch(() => undefined)

        onOpenChange(false)
        setSelected(null)
        setDetail(null)
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not load that scene."
        )

        if (options?.auto) {
          onOpenChange(true)
        }
      } finally {
        setRemixing(false)
      }
    },
    [onOpenChange, requestShaderConsent]
  )

  useEffect(() => {
    if (!autoOpenSlug || autoOpened.current) {
      return
    }

    autoOpened.current = true

    void (async () => {
      const scene = await fetch(`/api/community/scenes/${autoOpenSlug}`)
        .then((res) => res.json() as Promise<{ scene?: CommunitySceneDetail }>)
        .then((data) => data.scene ?? null)
        .catch(() => null)

      if (scene) {
        await remix(scene, { auto: true })

        return
      }

      setError("That scene is no longer available.")
      onOpenChange(true)
    })().finally(() => {
      useEditorStore.getState().clearPendingScene()
    })
  }, [autoOpenSlug, onOpenChange, remix])

  const ownedSlugs = new Set((mine ?? []).map((entry) => entry.slug))

  const applyCounts = useCallback(
    (slug: string, counts: { likeCount?: number; remixCount?: number }) => {
      const patch = <T extends CommunitySceneSummary>(entry: T): T =>
        entry.slug === slug ? { ...entry, ...counts } : entry

      explore.patch(slug, counts)
      setMine((current) => (current ? current.map(patch) : current))
      setSelected((current) => (current ? patch(current) : current))
      setDetail((current) => (current ? patch(current) : current))
    },
    [explore]
  )

  const changeLike = useCallback(
    (slug: string, next: { count: number; liked: boolean }) => {
      applyCounts(slug, { likeCount: next.count })
      setLiked((current) => {
        const nextSet = new Set(current)

        if (next.liked) {
          nextSet.add(slug)
        } else {
          nextSet.delete(slug)
        }

        return nextSet
      })
    },
    [applyCounts]
  )

  const forgetScene = useCallback(
    (slug: string) => {
      explore.remove(slug)
      setMine((current) =>
        current ? current.filter((entry) => entry.slug !== slug) : current
      )
      setSelected(null)
      setDetail(null)
    },
    [explore]
  )

  if (!mounted) {
    return null
  }

  return createPortal(
    <>
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
                        Publish your scene
                      </Button>
                    ) : (
                      <Typography as="span" tone="tertiary" variant="caption">
                        Sign in to publish
                      </Typography>
                    )}
                    <AuthMenu onViewProfile={openProfile} />
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
                    {selected || selectedHandle ? (
                      <Button
                        onClick={() => {
                          if (selected) {
                            setSelected(null)
                            setDetail(null)

                            return
                          }

                          setSelectedHandle(null)
                        }}
                        size="compact"
                        variant="ghost"
                      >
                        <ArrowLeftIcon height={14} width={14} />
                        {selected && selectedHandle
                          ? backToProfileLabel
                          : "All scenes"}
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
                            {tab === "explore" ? (
                              <span
                                aria-hidden="true"
                                className="mx-1 h-4 w-px shrink-0 bg-[var(--ds-border-divider)]"
                              />
                            ) : null}
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

                  {selected || selectedHandle || tab !== "explore" ? null : (
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
                      isOwn={ownedSlugs.has(selected.slug)}
                      onDeleted={forgetScene}
                      onOpenAuthor={openProfile}
                      onOpenSlug={openSceneBySlug}
                      onRemix={remix}
                      onLikeChange={(next) =>
                        changeLike(selected.slug, next)
                      }
                      remixing={remixing}
                      scene={selected}
                      liked={liked.has(selected.slug)}
                    />
                  ) : null}

                  {!selected && selectedHandle ? (
                    <ProfilePanel
                      handle={selectedHandle}
                      onRenamed={setSelectedHandle}
                      onSelect={openScene}
                    />
                  ) : null}

                  {!(selected || selectedHandle) && tab === "mine" ? (
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
                        <EmptyState
                          action={
                            mineFailed ? null : (
                              <Button
                                onClick={onRequestPublish}
                                variant="secondary"
                              >
                                Publish your scene
                              </Button>
                            )
                          }
                          description={
                            mineFailed
                              ? "Something went wrong reading your scenes. Try reopening this tab."
                              : "Anything you publish shows up here, with its likes and remixes."
                          }
                          glyph={<PublishedGlyph />}
                          title={
                            mineFailed
                              ? "Could not load your scenes"
                              : "Nothing published yet"
                          }
                        />
                      ) : null}

                      {mine && mine.length > 0 ? (
                        <MyScenesGrid onSelect={openScene} scenes={mine} />
                      ) : null}
                    </div>
                  ) : null}

                  {!(selected || selectedHandle) && tab === "likes" ? (
                    <div className="h-full overflow-y-auto p-4">
                      {likedScenes === null && !error ? (
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

                      {likedScenes?.length === 0 ? (
                        <EmptyState
                          description={
                            likedScenesFailed
                              ? "Something went wrong reading your likes. Try reopening this tab."
                              : "Hit the heart on any scene and it will be waiting here."
                          }
                          glyph={<LikesGlyph />}
                          title={
                            likedScenesFailed
                              ? "Could not load your likes"
                              : "Nothing liked yet"
                          }
                        />
                      ) : null}

                      {likedScenes && likedScenes.length > 0 ? (
                        <div className="grid grid-cols-2 gap-[var(--ds-space-4)] min-[720px]:grid-cols-4">
                          {likedScenes.map((scene) => (
                            <SceneCard
                              key={scene.slug}
                              onSelect={openScene}
                              scene={scene}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!(selected || selectedHandle) && tab === "drafts" ? (
                    <div className="h-full overflow-y-auto p-4">
                      {drafts === null && !error ? (
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

                      {drafts && !draftsFailed ? (
                        <div className="mb-[var(--ds-space-4)] flex items-center justify-between gap-[var(--ds-space-3)]">
                          {drafts.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Typography
                                as="span"
                                tone="tertiary"
                                variant="caption"
                              >
                                {drafts.length} of {MAX_DRAFTS_PER_AUTHOR} slots
                                used
                              </Typography>
                              <DraftSaveHint />
                            </span>
                          ) : (
                            <span />
                          )}
                          <Button
                            disabled={
                              busyDraftId !== null ||
                              drafts.length >= MAX_DRAFTS_PER_AUTHOR
                            }
                            onClick={() => void saveAsNewDraft()}
                            size="compact"
                            variant="secondary"
                          >
                            Save current scene as new draft
                          </Button>
                        </div>
                      ) : null}

                      {drafts?.length === 0 ? (
                        <EmptyState
                          glyph={<DraftsGlyph />}
                          title={
                            draftsFailed
                              ? "Could not load your drafts"
                              : "No drafts yet"
                          }
                        />
                      ) : null}

                      {drafts && drafts.length > 0 ? (
                        <DraftsGrid
                          busyId={busyDraftId}
                          drafts={drafts}
                          onDelete={deleteDraft}
                          onOpen={openDraft}
                          onPublish={publishDraft}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {!(selected || selectedHandle) && tab === "explore" ? (
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
                          {items.map((scene, index) => (
                            <SceneCard
                              featured={isFeaturedIndex(index, {
                                query,
                                sort,
                                total: items.length,
                              })}
                              key={scene.id}
                              onSelect={openScene}
                              scene={scene}
                            />
                          ))}
                        </div>
                      ) : null}

                      {items && items.length > 0 ? (
                        <SceneLoadMore
                          error={explore.error}
                          hasMore={explore.hasMore}
                          loadMore={explore.loadMore}
                          loading={explore.loading}
                          total={items.length}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>

    <ShaderConsentDialog
      onCancel={() => settleShaderConsent(false)}
      onConfirm={() => settleShaderConsent(true)}
      open={consentTitle !== null}
      sceneTitle={consentTitle ?? ""}
    />
    </>,
    document.body
  )
}
