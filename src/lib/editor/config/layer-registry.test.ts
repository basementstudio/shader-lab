import { describe, expect, it } from "bun:test"
import { isParamVisible } from "@/components/editor/properties-sidebar-utils"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { buildParameterValues } from "@/lib/editor/parameter-schema"
import { PATTERN_PRESET_SOURCES } from "@/renderer/pattern-atlas"

describe("CRT layer registry", () => {
  it("provides the new CRT defaults without migration", () => {
    const definition = getLayerDefinition("crt")
    const params = buildParameterValues(definition.params)

    expect(params.crtMode).toBe("slot-mask")
    expect(params.cellSize).toBe(3)
    expect(params.beamFocus).toBe(0.58)
    expect(params.brightness).toBe(1.2)
    expect(params.highlightDrive).toBe(1)
    expect(params.highlightThreshold).toBe(0.62)
    expect(params.shoulder).toBe(0.25)
    expect(params.chromaRetention).toBe(1.15)
    expect(params.shadowLift).toBe(0.16)
    expect(params.persistence).toBe(0.18)
    expect(params.signalArtifacts).toBe(0.45)
    expect(params.chromaticAberration).toBe(2)
  })

  it("only shows signal artifacts for composite TV mode", () => {
    const definition = getLayerDefinition("crt")
    const signalArtifacts = definition.params.find(
      (param) => param.key === "signalArtifacts"
    )

    expect(signalArtifacts).not.toBeUndefined()

    expect(
      isParamVisible(signalArtifacts!, { crtMode: "slot-mask" }, [
        ...definition.params,
      ])
    ).toBe(false)
    expect(
      isParamVisible(signalArtifacts!, { crtMode: "aperture-grille" }, [
        ...definition.params,
      ])
    ).toBe(false)
    expect(
      isParamVisible(signalArtifacts!, { crtMode: "composite-tv" }, [
        ...definition.params,
      ])
    ).toBe(true)
  })

  it("shows custom halftone palette fields only in custom mode", () => {
    const definition = getLayerDefinition("halftone")
    const params = buildParameterValues(definition.params)
    const bloomEnabled = definition.params.find(
      (param) => param.key === "bloomEnabled"
    )
    const customBias = definition.params.find(
      (param) => param.key === "customLuminanceBias"
    )
    const customColor4 = definition.params.find(
      (param) => param.key === "customColor4"
    )
    const customBackground = definition.params.find(
      (param) => param.key === "customBgColor"
    )

    expect(bloomEnabled).not.toBeUndefined()
    expect(customBias).not.toBeUndefined()
    expect(customColor4).not.toBeUndefined()
    expect(customBackground).not.toBeUndefined()

    expect(params.bloomEnabled).toBe(false)
    expect(isParamVisible(bloomEnabled!, params, [...definition.params])).toBe(
      false
    )
    expect(params.customLuminanceBias).toBe(0)
    expect(isParamVisible(customBias!, params, [...definition.params])).toBe(
      false
    )
    expect(
      isParamVisible(customBackground!, params, [...definition.params])
    ).toBe(false)
    expect(isParamVisible(customColor4!, params, [...definition.params])).toBe(
      true
    )
    expect(
      isParamVisible(bloomEnabled!, { ...params, colorMode: "custom" }, [
        ...definition.params,
      ])
    ).toBe(true)
    expect(
      isParamVisible(customBias!, { ...params, colorMode: "custom" }, [
        ...definition.params,
      ])
    ).toBe(true)
    expect(
      isParamVisible(customBackground!, { ...params, colorMode: "custom" }, [
        ...definition.params,
      ])
    ).toBe(true)
    expect(
      isParamVisible(
        customColor4!,
        { ...params, colorMode: "custom", customColorCount: 3 },
        [...definition.params]
      )
    ).toBe(false)
    expect(
      isParamVisible(
        customColor4!,
        { ...params, colorMode: "custom", customColorCount: 4 },
        [...definition.params]
      )
    ).toBe(true)
  })

  it("provides hidden defaults for the custom shader source layer", () => {
    const definition = getLayerDefinition("custom-shader")
    const params = buildParameterValues(definition.params)
    const sourceCode = definition.params.find(
      (param) => param.key === "sourceCode"
    )

    expect(params.sourceMode).toBe("paste")
    expect(params.entryExport).toBe("sketch")
    expect(params.sourceRevision).toBe(0)
    expect(typeof params.sourceCode).toBe("string")
    expect(sourceCode).not.toBeUndefined()
    expect(isParamVisible(sourceCode!, params, [...definition.params])).toBe(
      false
    )
  })

  it("provides pattern defaults and conditional field visibility", () => {
    const definition = getLayerDefinition("pattern")
    const params = buildParameterValues(definition.params)
    const monoColor = definition.params.find((param) => param.key === "monoColor")
    const bgOpacity = definition.params.find((param) => param.key === "bgOpacity")
    const bloomEnabled = definition.params.find((param) => param.key === "bloomEnabled")
    const bloomIntensity = definition.params.find((param) => param.key === "bloomIntensity")

    expect(params.cellSize).toBe(12)
    expect(params.preset).toBe("bars")
    expect(params.colorMode).toBe("source")
    expect(params.monoColor).toBe("#f5f5f0")
    expect(params.bgOpacity).toBe(0)
    expect(params.invert).toBe(false)
    expect(params.customColorCount).toBe(4)
    expect(params.customLuminanceBias).toBe(0)
    expect(params.customBgColor).toBe("#F5F5F0")
    expect(params.customColor1).toBe("#0d1014")
    expect(params.customColor2).toBe("#4d5057")
    expect(params.customColor3).toBe("#969aa2")
    expect(params.customColor4).toBe("#e1e2de")
    expect(params.bloomEnabled).toBe(false)
    expect(params.bloomIntensity).toBe(1.25)
    expect(monoColor).not.toBeUndefined()
    expect(bgOpacity).not.toBeUndefined()
    expect(bloomEnabled).not.toBeUndefined()
    expect(bloomIntensity).not.toBeUndefined()
    const customColorCount = definition.params.find(
      (param) => param.key === "customColorCount"
    )
    const customColor3 = definition.params.find((param) => param.key === "customColor3")
    expect(customColorCount).not.toBeUndefined()
    expect(customColor3).not.toBeUndefined()
    expect(isParamVisible(monoColor!, params, [...definition.params])).toBe(false)
    expect(isParamVisible(bgOpacity!, params, [...definition.params])).toBe(true)
    expect(isParamVisible(bloomIntensity!, params, [...definition.params])).toBe(false)
    expect(
      isParamVisible(customColorCount!, params, [...definition.params])
    ).toBe(false)
    expect(
      isParamVisible(
        monoColor!,
        { ...params, colorMode: "monochrome" },
        [...definition.params]
      )
    ).toBe(true)
    expect(
      isParamVisible(
        bgOpacity!,
        { ...params, colorMode: "quantized" },
        [...definition.params]
      )
    ).toBe(false)
    expect(
      isParamVisible(
        customColorCount!,
        { ...params, colorMode: "custom" },
        [...definition.params]
      )
    ).toBe(true)
    expect(
      isParamVisible(
        customColor3!,
        { ...params, colorMode: "custom", customColorCount: 3 },
        [...definition.params]
      )
    ).toBe(true)
    expect(
      isParamVisible(
        customColor3!,
        { ...params, colorMode: "custom", customColorCount: 2 },
        [...definition.params]
      )
    ).toBe(false)
    expect(
      isParamVisible(
        bloomIntensity!,
        { ...params, bloomEnabled: true },
        [...definition.params]
      )
    ).toBe(true)
  })

  it("keeps pattern preset SVG ordering stable", () => {
    expect(PATTERN_PRESET_SOURCES.bars).toEqual([
      "/assets/patterns/bars/1.svg",
      "/assets/patterns/bars/2.svg",
      "/assets/patterns/bars/3.svg",
      "/assets/patterns/bars/4.svg",
      "/assets/patterns/bars/5.svg",
      "/assets/patterns/bars/6.svg",
    ])
    expect(PATTERN_PRESET_SOURCES.candles).toEqual([
      "/assets/patterns/candles/1.svg",
      "/assets/patterns/candles/2.svg",
      "/assets/patterns/candles/3.svg",
      "/assets/patterns/candles/4.svg",
    ])
    expect(PATTERN_PRESET_SOURCES.shapes).toEqual([
      "/assets/patterns/shapes/1.svg",
      "/assets/patterns/shapes/2.svg",
      "/assets/patterns/shapes/3.svg",
      "/assets/patterns/shapes/4.svg",
      "/assets/patterns/shapes/5.svg",
      "/assets/patterns/shapes/6.svg",
    ])
  })

  it("provides text source defaults", () => {
    const definition = getLayerDefinition("text")
    const params = buildParameterValues(definition.params)

    expect(params.text).toBe("basement.studio")
    expect(params.fontSize).toBe(48)
    expect(params.fontFamily).toBe("sans")
    expect(params.fontWeight).toBe(700)
    expect(params.letterSpacing).toBe(-0.05)
    expect(params.textColor).toBe("#ffffff")
    expect(params.backgroundColor).toBe("#000000")
  })

  it("provides ink effect defaults", () => {
    const definition = getLayerDefinition("ink")
    const params = buildParameterValues(definition.params)

    expect(params.blurPasses).toBe(13)
    expect(params.crispPasses).toBe(3)
    expect(params.crispBlend).toBe(0.81)
    expect(params.blurStrength).toBe(0.044)
    expect(params.blurDirection).toBe(90)
    expect(params.dripLength).toBe(1)
    expect(params.dripWeight).toBe(0.4)
    expect(params.fluidNoise).toBe(0.02)
    expect(params.noiseScale).toBe(1.2)
    expect(params.smokeSpeed).toBe(0.36)
    expect(params.smokeTurbulence).toBe(0)
    expect(params.blurSpread).toBe(1.6)
    expect(params.coreColor).toBe("#fffde8")
    expect(params.midColor).toBe("#FFA700")
    expect(params.edgeColor).toBe("#7192F1")
    expect(params.backgroundColor).toBe("#000000")
    expect(params.grainEnabled).toBe(false)
    expect(params.bloomEnabled).toBe(true)
    expect(params.bloomIntensity).toBe(6.19)
    expect(params.bloomThreshold).toBe(0.97)
    expect(params.bloomRadius).toBe(0)
    expect(params.bloomSoftness).toBe(0.96)
  })
})
