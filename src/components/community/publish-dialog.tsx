"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { GlassPanel } from "@/components/ui/glass-panel"
import { IconButton } from "@/components/ui/icon-button"
import { Slider } from "@/components/ui/slider"
import { Typography } from "@/components/ui/typography"
import {
  captureThumbnail,
  describePublishPlan,
  getThumbnailTimeBounds,
  type PublishPlan,
  publishScene,
  THUMBNAIL_MAX_TIME_SECONDS,
} from "@/lib/community/publish-client"
import { formatBytes } from "@/lib/community/upload-limits"
import {
  CURATED_SCENE_TAGS,
  getSceneTagLabel,
  MAX_SCENE_TAGS,
  type CuratedSceneTag,
} from "@/lib/community/scene-tags"
import { acquirePreviewRenderLock } from "@/lib/editor/preview-render-lock"
import { numberInputControlClassName } from "@/components/ui/number-input"
import { cn } from "@/lib/cn"
import { useTimelineStore } from "@/store/timeline-store"

export function PublishDialog({
  onOpenChange,
  onPublished,
  open,
}: {
  onOpenChange: (open: boolean) => void
  onPublished: (slug: string | null) => void
  open: boolean
}) {
  const reduceMotion = useReducedMotion() ?? false
  const duration = useTimelineStore((state) => state.duration)
  const bounds = getThumbnailTimeBounds(duration)

  const [mounted, setMounted] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<CuratedSceneTag[]>([])
  const [thumbnailTime, setThumbnailTime] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    setPublishing(false)
    setError(null)
    setTags([])
    setPlan(describePublishPlan())

    const state = useTimelineStore.getState()
    const max = Math.min(
      Number.isFinite(state.duration) ? Math.max(0, state.duration) : 0,
      THUMBNAIL_MAX_TIME_SECONDS
    )
    const seeded = Math.min(Math.max(state.currentTime, 0), max)

    setThumbnailTime(Math.round(seeded * 100) / 100)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    return acquirePreviewRenderLock()
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onOpenChange, open])

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    },
    []
  )

  const refreshPreview = useCallback(async (time: number) => {
    setCapturing(true)
    setError(null)

    try {
      const blob = await captureThumbnail(time)
      const url = URL.createObjectURL(blob)

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }

      previewUrlRef.current = url
      setPreviewUrl(url)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not capture a preview."
      )
    } finally {
      setCapturing(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const timeout = window.setTimeout(() => {
      void refreshPreview(thumbnailTime)
    }, 260)

    return () => window.clearTimeout(timeout)
  }, [open, refreshPreview, thumbnailTime])

  const submit = useCallback(async () => {
    setPublishing(true)
    setError(null)

    try {
      const result = await publishScene({
        description,
        tags,
        thumbnailTime,
        title,
      })

      onPublished(result.slug)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not publish this scene."
      )
    } finally {
      setPublishing(false)
    }
  }, [description, onPublished, tags, thumbnailTime, title])

  const toggleTag = useCallback((tag: CuratedSceneTag) => {
    setTags((current) => {
      if (current.includes(tag)) {
        return current.filter((entry) => entry !== tag)
      }

      return current.length < MAX_SCENE_TAGS ? [...current, tag] : current
    })
  }, [])

  if (!mounted) {
    return null
  }

  const blocked = plan?.problem ?? null
  const notice = blocked ?? error
  const canSubmit =
    title.trim().length > 0 && !(blocked || capturing || publishing)
  const summary = plan
    ? [
        plan.assetCount > 0
          ? `${plan.assetCount} ${plan.assetCount === 1 ? "file" : "files"} · ${formatBytes(plan.totalBytes)}`
          : "No media to upload",
        plan.hiddenLayerCount > 0
          ? `${plan.hiddenLayerCount} hidden ${plan.hiddenLayerCount === 1 ? "layer" : "layers"} excluded`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <div className="fixed inset-0 z-90" role="presentation">
          <motion.button
            animate={{ opacity: 1 }}
            aria-label="Close publish dialog"
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

          <div className="absolute top-[76px] left-1/2 w-[min(720px,calc(100vw-32px))] -translate-x-1/2">
            <motion.div
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
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
                className="max-h-[calc(100vh-112px)] overflow-y-auto p-0"
                role="dialog"
                variant="panel"
              >
                <div className="flex items-center justify-between border-b border-[var(--ds-border-divider)] px-4 pt-[14px] pb-3">
                  <Typography as="h2" className="leading-5" variant="title">
                    Publish to community
                  </Typography>
                  <IconButton
                    aria-label="Close publish dialog"
                    className="h-7 w-7"
                    onClick={() => onOpenChange(false)}
                    variant="default"
                  >
                    <Cross2Icon height={18} width={18} />
                  </IconButton>
                </div>

                {notice ? (
                  <div
                    className="border-b border-[var(--ds-border-divider)] bg-[rgb(120_28_28_/_0.22)] px-4 py-2"
                    role="alert"
                  >
                    <Typography as="p" variant="caption">
                      {notice}
                    </Typography>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 p-4 min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-[var(--ds-space-3)]">
                      <label className="flex flex-col gap-1.5">
                        <Typography as="span" tone="tertiary" variant="overline">
                          Title
                        </Typography>
                        <input
                          className={cn(numberInputControlClassName, "px-2")}
                          maxLength={80}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="Name your scene"
                          value={title}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <Typography as="span" tone="tertiary" variant="overline">
                          Description
                        </Typography>
                        <textarea
                          className={cn(
                            numberInputControlClassName,
                            "min-h-[76px] resize-none px-2 py-1.5"
                          )}
                          maxLength={500}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                          placeholder="What is going on in this scene?"
                          value={description}
                        />
                      </label>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <Typography as="span" tone="tertiary" variant="overline">
                            Tags
                          </Typography>
                          <Typography as="span" tone="tertiary" variant="monoXs">
                            {tags.length}/{MAX_SCENE_TAGS}
                          </Typography>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {CURATED_SCENE_TAGS.map((tag) => {
                            const selected = tags.includes(tag)

                            return (
                              <button
                                aria-pressed={selected}
                                className={cn(
                                  "min-h-7 cursor-pointer rounded-[var(--ds-radius-control)] border px-2 transition-colors duration-160 disabled:cursor-not-allowed disabled:opacity-40",
                                  selected
                                    ? "border-[var(--ds-border-active)] bg-[var(--ds-color-surface-active)] text-[var(--ds-color-text-primary)]"
                                    : "border-[var(--ds-border-subtle)] bg-transparent text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-border-active)]"
                                )}
                                disabled={
                                  !selected && tags.length >= MAX_SCENE_TAGS
                                }
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                type="button"
                              >
                                <Typography as="span" variant="monoXs">
                                  {getSceneTagLabel(tag)}
                                </Typography>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <Slider
                        label="Thumbnail frame"
                        max={bounds.max}
                        min={bounds.min}
                        onValueChange={setThumbnailTime}
                        step={0.05}
                        value={thumbnailTime}
                        valueFormatOptions={{
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        }}
                        valueSuffix="s"
                      />

                      {summary ? (
                        <Typography as="p" tone="tertiary" variant="monoXs">
                          {summary}
                        </Typography>
                      ) : null}

                      <Button
                        className="relative overflow-hidden"
                        disabled={!canSubmit}
                        fullWidth
                        onClick={submit}
                        variant="primary"
                      >
                        {publishing ? "Publishing…" : "Publish"}
                        {publishing ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-black/12"
                          >
                            <span className="absolute inset-y-0 left-0 w-[38%] animate-[loader-sweep_1.15s_cubic-bezier(0.22,1,0.36,1)_infinite] bg-black/45" />
                          </span>
                        ) : null}
                      </Button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Typography as="span" tone="tertiary" variant="overline">
                        Thumbnail
                      </Typography>
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] border border-[var(--ds-border-subtle)] bg-[var(--ds-color-surface-subtle)]">
                        {previewUrl ? (
                          // biome-ignore lint/performance/noImgElement: object URL from a freshly captured frame, not a remote asset
                          <img
                            alt="Thumbnail preview"
                            className="absolute inset-0 h-full w-full object-cover"
                            src={previewUrl}
                          />
                        ) : null}
                        {capturing ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-[rgb(8_9_12_/_0.45)]">
                            <Typography
                              align="center"
                              as="span"
                              tone="secondary"
                              variant="monoXs"
                            >
                              Rendering frame…
                            </Typography>
                          </div>
                        ) : null}
                      </div>
                    </div>
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
