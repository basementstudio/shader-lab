import { describe, expect, it } from "bun:test"
import { isParamVisible } from "@/components/editor/properties-sidebar-utils"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { buildParameterValues } from "@/lib/editor/parameter-schema"

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
})
