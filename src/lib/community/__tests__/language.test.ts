import { describe, expect, test } from "bun:test"
import {
  censorProjectFile,
  censorText,
  findSevereLanguageInScene,
  hasProfanity,
  hasSevereLanguage,
} from "@/lib/community/language"
import { parseLabProjectFile } from "@/lib/editor/project-file"

function layer(overrides: Record<string, unknown> = {}) {
  return {
    assetId: null,
    blendMode: "normal",
    compositeMode: "filter",
    expanded: true,
    hue: 0,
    id: "layer-1",
    kind: "source",
    locked: false,
    maskConfig: { invert: false, mode: "multiply", source: "luminance" },
    name: "Gradient",
    opacity: 1,
    params: {},
    runtimeError: null,
    saturation: 1,
    type: "gradient",
    visible: true,
    ...overrides,
  }
}

function labFile(layers: unknown[]) {
  return JSON.stringify({
    assets: [],
    composition: { height: 800, width: 1200 },
    format: "shader-lab",
    layers,
    selectedLayerId: null,
    timeline: { duration: 6, loop: true, tracks: [] },
    version: 5,
  })
}

describe("censorText", () => {
  test("masks a slur and leaves the rest of the sentence alone", () => {
    expect(censorText("fuck this gradient")).toBe("**** this gradient")
  })

  test("sees through leetspeak and repeated letters", () => {
    expect(censorText("sh1t")).toBe("****")
    expect(censorText("fuuuuck")).not.toContain("uuuu")
  })

  test("returns clean text unchanged, by identity", () => {
    const clean = "A calm noise field"

    expect(censorText(clean)).toBe(clean)
  })

  test("does not trip on words that merely contain a smaller word", () => {
    for (const clean of [
      "bass drop",
      "classic pass",
      "Assassin's Creed",
      "Scunthorpe skyline",
      "analysis grid",
    ]) {
      expect(censorText(clean)).toBe(clean)
    }
  })

  test("handles empty input without building a matcher", () => {
    expect(censorText("")).toBe("")
    expect(hasProfanity("")).toBe(false)
  })
})

describe("censorProjectFile", () => {
  test("masks a layer name", () => {
    const parsed = parseLabProjectFile(
      labFile([layer({ name: "fuck gradient" })])
    )
    const result = censorProjectFile(parsed)

    expect(result.changed).toBe(true)
    expect(result.projectFile.layers[0]?.name).toBe("**** gradient")
  })

  test("masks the string a text layer paints on the canvas", () => {
    const parsed = parseLabProjectFile(
      labFile([layer({ params: { text: "shit" }, type: "text" })])
    )
    const result = censorProjectFile(parsed)

    expect(result.changed).toBe(true)
    expect(result.projectFile.layers[0]?.params.text).toBe("****")
  })

  test("leaves a same-named param on a non-text layer alone", () => {
    const parsed = parseLabProjectFile(
      labFile([layer({ params: { text: "shit" }, type: "gradient" })])
    )
    const result = censorProjectFile(parsed)

    expect(result.changed).toBe(false)
    expect(result.projectFile.layers[0]?.params.text).toBe("shit")
  })

  test("reports no change for a clean scene, so the upload stays byte-identical", () => {
    const parsed = parseLabProjectFile(labFile([layer()]))
    const result = censorProjectFile(parsed)

    expect(result.changed).toBe(false)
    expect(result.projectFile).toBe(parsed)
  })

  test("censors every layer, not just the first", () => {
    const parsed = parseLabProjectFile(
      labFile([
        layer({ id: "layer-1", name: "clean" }),
        layer({ id: "layer-2", name: "fuck" }),
      ])
    )
    const result = censorProjectFile(parsed)

    expect(result.projectFile.layers[0]?.name).toBe("clean")
    expect(result.projectFile.layers[1]?.name).toBe("****")
  })

  test("does not mutate the file it was handed", () => {
    const parsed = parseLabProjectFile(labFile([layer({ name: "fuck" })]))

    censorProjectFile(parsed)

    expect(parsed.layers[0]?.name).toBe("fuck")
  })

  test("keeps fields the schema does not know about, at every level", () => {
    const raw = labFile([
      layer({
        futureLayerField: "keep me",
        name: "fuck",
        params: { futureParam: 3 },
      }),
    ])
    const withExtras = JSON.parse(raw)

    withExtras.futureTopLevelField = ["a", "b"]

    const censored = censorProjectFile(
      parseLabProjectFile(JSON.stringify(withExtras))
    )
    const stored = JSON.parse(JSON.stringify(censored.projectFile))

    expect(stored.layers[0].name).toBe("****")
    expect(stored.layers[0].futureLayerField).toBe("keep me")
    expect(stored.layers[0].params.futureParam).toBe(3)
    expect(stored.futureTopLevelField).toEqual(["a", "b"])
  })

  test("survives a round trip through JSON, which is what gets stored", () => {
    const parsed = parseLabProjectFile(
      labFile([layer({ name: "fuck", params: { text: "hello" }, type: "text" })])
    )
    const stored = JSON.stringify(censorProjectFile(parsed).projectFile)
    const reparsed = parseLabProjectFile(stored)

    expect(reparsed.layers[0]?.name).toBe("****")
    expect(reparsed.layers[0]?.params.text).toBe("hello")
    expect(reparsed.layers).toHaveLength(1)
  })
})

describe("the severe tier", () => {
  test("blocks slurs", () => {
    for (const value of ["NIGGER", "faggot", "a chink joke", "spic", "wetback"]) {
      expect(hasSevereLanguage(value)).toBe(true)
    }
  })

  test("lets ordinary swearing through, so it gets censored instead", () => {
    for (const value of ["fuck this gradient", "shitty scene", "ass", "twat"]) {
      expect(hasSevereLanguage(value)).toBe(false)
      expect(hasProfanity(value)).toBe(true)
    }
  })

  test("says nothing about words the dataset does not carry", () => {
    expect(hasProfanity("damn")).toBe(false)
    expect(hasSevereLanguage("damn")).toBe(false)
  })

  test("the house list is word-bounded, not a substring match", () => {
    for (const clean of [
      "raccoon study",
      "cocoon",
      "tycoon gradient",
      "spice rack",
      "suspicious noise",
      "conspicuous",
      "gobbledygook",
      "packing list",
      "Pakistan skyline",
      "custard",
      "bean field",
    ]) {
      expect(hasSevereLanguage(clean)).toBe(false)
    }
  })

  test("still sees through leetspeak and casing", () => {
    expect(hasSevereLanguage("N1GG3R")).toBe(true)
  })
})

describe("findSevereLanguageInScene", () => {
  const clean = () => parseLabProjectFile(labFile([layer()]))

  test("names the title", () => {
    expect(
      findSevereLanguageInScene({ projectFile: clean(), title: "nigger" })
    ).toBe("the title")
  })

  test("names the description", () => {
    expect(
      findSevereLanguageInScene({
        description: "a scene about faggots",
        projectFile: clean(),
        title: "Fine",
      })
    ).toBe("the description")
  })

  test("names the text layer", () => {
    const projectFile = parseLabProjectFile(
      labFile([layer({ params: { text: "NIGGER" }, type: "text" })])
    )

    expect(findSevereLanguageInScene({ projectFile, title: "Fine" })).toBe(
      "the text on one of your text layers"
    )
  })

  test("names layer names", () => {
    const projectFile = parseLabProjectFile(labFile([layer({ name: "kike" })]))

    expect(findSevereLanguageInScene({ projectFile, title: "Fine" })).toBe(
      "your layer names"
    )
  })

  test("never echoes the word back at the person", () => {
    const projectFile = parseLabProjectFile(
      labFile([layer({ params: { text: "NIGGER" }, type: "text" })])
    )
    const where = findSevereLanguageInScene({ projectFile, title: "Fine" })

    expect(where?.toLowerCase()).not.toContain("nig")
  })

  test("passes a clean scene", () => {
    expect(
      findSevereLanguageInScene({
        description: "a calm noise field",
        projectFile: clean(),
        title: "Drift",
      })
    ).toBeNull()
  })

  test("lets an ordinary swear through, so it is censored not blocked", () => {
    const projectFile = parseLabProjectFile(
      labFile([layer({ params: { text: "fuck" }, type: "text" })])
    )

    expect(
      findSevereLanguageInScene({ projectFile, title: "fucking gradient" })
    ).toBeNull()
  })
})
