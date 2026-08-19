import {
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
  TextCensor,
} from "obscenity"
import type { LabProjectFile } from "@/lib/editor/project-file"

let matcher: RegExpMatcher | null = null
let censor: TextCensor | null = null

function getMatcher(): RegExpMatcher {
  matcher ??= new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  })

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
