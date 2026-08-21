export const CURATED_SCENE_TAGS = [
  "abstract",
  "audio-reactive",
  "background",
  "branding",
  "generative",
  "glitch",
  "monochrome",
  "nature",
  "psychedelic",
  "retro",
  "sci-fi",
  "typography",
] as const

export type CuratedSceneTag = (typeof CURATED_SCENE_TAGS)[number]

export const CURATED_SCENE_TAG_LABELS: Record<CuratedSceneTag, string> = {
  abstract: "Abstract",
  "audio-reactive": "Audio reactive",
  background: "Background",
  branding: "Branding",
  generative: "Generative",
  glitch: "Glitch",
  monochrome: "Monochrome",
  nature: "Nature",
  psychedelic: "Psychedelic",
  retro: "Retro",
  "sci-fi": "Sci-fi",
  typography: "Typography",
}

export const MAX_SCENE_TAGS = 3

export function isCuratedSceneTag(value: unknown): value is CuratedSceneTag {
  return (
    typeof value === "string" &&
    (CURATED_SCENE_TAGS as readonly string[]).includes(value)
  )
}

export function getSceneTagLabel(tag: string): string {
  return CURATED_SCENE_TAG_LABELS[tag as CuratedSceneTag] ?? tag
}
