import {
  asteriskCensorStrategy,
  DataSet,
  englishDataset,
  type EnglishProfaneWord,
  englishRecommendedTransformers,
  pattern,
  RegExpMatcher,
  TextCensor,
} from "obscenity"
import type { LabProjectFile } from "@/lib/editor/project-file"

let matcher: RegExpMatcher | null = null
let censor: TextCensor | null = null

const HOUSE_PATTERNS = [
  pattern`|spic|`,
  pattern`|spics|`,
  pattern`|coon|`,
  pattern`|coons|`,
  pattern`|gook|`,
  pattern`|gooks|`,
  pattern`|paki|`,
  pattern`|pakis|`,
  pattern`|beaner|`,
  pattern`|beaners|`,
  pattern`|wetback|`,
  pattern`|wetbacks|`,
  pattern`|towelhead|`,
  pattern`|towelheads|`,
  pattern`|raghead|`,
  pattern`|ragheads|`,
  pattern`|shemale|`,
  pattern`|shemales|`,
  pattern`|mongoloid|`,
  pattern`|mongoloids|`,
  pattern`|goy|`,
  pattern`|goys|`,
  pattern`|goyim|`,
]

function getMatcher(): RegExpMatcher {
  if (!matcher) {
    const dataset = new DataSet<{ originalWord: EnglishProfaneWord }>().addAll(
      englishDataset
    )

    for (const raw of HOUSE_PATTERNS) {
      dataset.addPhrase((phrase) => phrase.addPattern(raw))
    }

    matcher = new RegExpMatcher({
      ...dataset.build(),
      ...englishRecommendedTransformers,
    })
  }

  return matcher
}

function getCensor(): TextCensor {
  censor ??= new TextCensor().setStrategy(asteriskCensorStrategy())

  return censor
}

export function hasProfanity(value: string): boolean {
  return value.length > 0 && getMatcher().hasMatch(value)
}

export function censorText(value: string): string {
  if (value.length === 0) {
    return value
  }

  const matches = getMatcher().getAllMatches(value, true)

  return matches.length === 0 ? value : getCensor().applyTo(value, matches)
}

const TEXT_LAYER_PARAM = "text"

export const BLOCKED_LANGUAGE_MESSAGE =
  "We're all for free speech, but we can't publish that."

export function describeBlockedLanguage(where: string): string {
  return `${BLOCKED_LANGUAGE_MESSAGE} Have a look at ${where}.`
}

export function findProfanityInProjectFile(
  projectFile: LabProjectFile
): string | null {
  for (const layer of projectFile.layers) {
    const rendered = layer.params[TEXT_LAYER_PARAM]

    if (
      layer.type === "text" &&
      typeof rendered === "string" &&
      hasProfanity(rendered)
    ) {
      return "the text on one of your text layers"
    }

    if (hasProfanity(layer.name)) {
      return "your layer names"
    }
  }

  return null
}

export function findProfanityInScene(input: {
  description?: string | null
  projectFile: LabProjectFile
  title?: string | null
}): string | null {
  if (input.title && hasProfanity(input.title)) {
    return "the title"
  }

  if (input.description && hasProfanity(input.description)) {
    return "the description"
  }

  return findProfanityInProjectFile(input.projectFile)
}

export interface CensoredProjectFile {
  changed: boolean
  projectFile: LabProjectFile
}

export function censorProjectFile(
  projectFile: LabProjectFile
): CensoredProjectFile {
  let changed = false

  const layers = projectFile.layers.map((layer) => {
    const name = censorText(layer.name)
    const rendered = layer.params[TEXT_LAYER_PARAM]
    const text =
      layer.type === "text" && typeof rendered === "string"
        ? censorText(rendered)
        : rendered

    if (name === layer.name && text === rendered) {
      return layer
    }

    changed = true

    return {
      ...layer,
      name,
      params:
        text === rendered
          ? layer.params
          : { ...layer.params, [TEXT_LAYER_PARAM]: text },
    }
  }) as LabProjectFile["layers"]

  return changed
    ? { changed, projectFile: { ...projectFile, layers } }
    : { changed, projectFile }
}
